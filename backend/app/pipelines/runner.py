
import os
import subprocess
import shutil
import logging
import asyncio
import traceback
import json
from pathlib import Path
import concurrent.futures
from typing import Dict, Optional, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from backend.app.artifacts.router import get_artifacts_for_pipeline


logger = logging.getLogger(__name__)
router = APIRouter()

# Store running processes: {pipeline_id: subprocess.Popen}
running_processes: Dict[str, Any] = {}
# Store logs: {pipeline_id: [logs]}
execution_logs: Dict[str, list] = {}

RUN_APPS_DIR = Path("run_apps")
RUN_APPS_DIR.mkdir(exist_ok=True)


def _docker_compose_command() -> list[str]:
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    return ["docker", "compose"]


def _inject_debug_script(path: str, file_content: str) -> str:
    if path != "index.html":
        return file_content
    debug_script = """<script>
window.onerror = function(msg, url, line, col, error) {
  document.body.innerHTML = '<div style="color:red;padding:20px;font-family:sans-serif;"><h1>Runtime Error</h1><pre>' + msg + '\\n' + url + ':' + line + '</pre></div>';
  return false;
};
window.onunhandledrejection = function(event) {
  document.body.innerHTML = '<div style="color:red;padding:20px;font-family:sans-serif;"><h1>Promise Rejection</h1><pre>' + event.reason + '</pre></div>';
};
</script>"""
    if "</head>" in file_content:
        return file_content.replace("</head>", f"{debug_script}</head>")
    if "<body>" in file_content:
        return file_content.replace("<body>", f"<body>{debug_script}")
    return file_content


def _ensure_runtime_scaffold(app_dir: Path, logs: list[str]) -> None:
    package_json_path = app_dir / "package.json"
    if not package_json_path.exists():
        logs.append("[*] package.json missing. Creating fallback Vite scaffold manifest.")
        package_json_path.write_text(json.dumps({
            "name": "generated-app",
            "private": True,
            "version": "0.1.0",
            "type": "module",
            "scripts": {
                "dev": "vite",
                "build": "vite build",
                "preview": "vite preview --host 0.0.0.0 --port 3001",
            },
            "dependencies": {
                "react": "^18.3.1",
                "react-dom": "^18.3.1",
            },
            "devDependencies": {
                "@vitejs/plugin-react": "^4.3.1",
                "vite": "^5.4.10",
            },
        }, indent=2), encoding="utf-8")

async def run_app_task(pipeline_id: str):
    """Background task to provision and run the app in a Docker container."""
    app_dir = RUN_APPS_DIR / pipeline_id
    app_dir.mkdir(parents=True, exist_ok=True)
    
    execution_logs[pipeline_id] = [f"[*] Provisioning Docker environment in {app_dir}..."]
    
    try:
        # 1. Fetch Artifacts
        artifacts = await get_artifacts_for_pipeline(pipeline_id)
        if not artifacts:
            execution_logs[pipeline_id].append("[!] No artifacts found to run.")
            return

        # 2. Write Files
        execution_logs[pipeline_id].append("[*] Exporting files...")
        for artifact in artifacts:
            content = artifact.get("content", {})
            
            # 2a. Handle legacy or special top-level docker keys
            if isinstance(content, dict):
                if "dockerfile" in content and isinstance(content["dockerfile"], str):
                    with open(app_dir / "Dockerfile", "w", encoding="utf-8") as f_out:
                        f_out.write(content["dockerfile"])
                if "docker_compose" in content and isinstance(content["docker_compose"], str):
                    with open(app_dir / "docker-compose.yml", "w", encoding="utf-8") as f_out:
                        f_out.write(content["docker_compose"])

            # 2b. Handle standard 'files' array
            files = content.get("files", [])
            if isinstance(files, list):
                for f in files:
                    path = f.get("path")
                    file_content = f.get("content")
                    if path and file_content:
                        file_path = app_dir / path
                        file_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(file_path, "w", encoding="utf-8") as f_out:
                            f_out.write(_inject_debug_script(path, file_content))
            elif isinstance(content, dict):
                # Handle legacy flat format
                for path, file_content in content.items():
                    if isinstance(file_content, str) and path not in ["dockerfile", "docker_compose"]:
                        file_path = app_dir / path
                        file_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(file_path, "w", encoding="utf-8") as f_out:
                            f_out.write(_inject_debug_script(path, file_content))

        _ensure_runtime_scaffold(app_dir, execution_logs[pipeline_id])
        
        # 3. Ensure Dockerfile and docker-compose exist (Optimized for IDE Preview)
        # We use a development-focused Dockerfile for the IDE preview to avoid 
        # Base URL / subpath proxying issues that occur with production builds.
        execution_logs[pipeline_id].append("[*] Configuring development runtime...")
        dockerfile = (
            "FROM node:20-alpine\n"
            "WORKDIR /app\n"
            "COPY package.json yarn.lock* package-lock.json* ./\n"
            "RUN if [ -f yarn.lock ]; then yarn install; else npm install; fi\n"
            "COPY . .\n"
            "ENV PORT=3001\n"
            "ENV HOSTNAME=0.0.0.0\n"
            "EXPOSE 3001\n"
            "CMD [\"sh\", \"-c\", \"if [ -f yarn.lock ]; then yarn dev --port 3001 --host 0.0.0.0; else npm run dev -- --port 3001 --host 0.0.0.0; fi\"]"
        )
        # We overwrite the artifact's dockerfile if it exists, as it's likely a production build
        with open(app_dir / "Dockerfile", "w", encoding="utf-8") as f_out:
            f_out.write(dockerfile)
        
        container_name = f"agent-workspace-{pipeline_id[:8]}"
        compose = (
            "version: '3.8'\n"
            "services:\n"
            f"  app:\n"
                f"    container_name: {container_name}\n"
                "    build: .\n"
                "    ports:\n"
                "      - \"3001:3001\"\n"
                "    environment:\n"
                "      - NODE_ENV=development\n"
                "      - PORT=3001\n"
                "      - VITE_BASE=./"
        )
        # Always use our optimized compose for the runner
        with open(app_dir / "docker-compose.yml", "w", encoding="utf-8") as f_out:
            f_out.write(compose)

        # 4. Run Docker Compose
        execution_logs[pipeline_id].append("[*] Building and starting containers (this may take a minute)...")
        execution_logs[pipeline_id].append("[*] Preview will be available via /api/proxy/3001/ once Vite is ready.")
        
        # We use --build to ensure fresh code is used
        compose_cmd = _docker_compose_command()
        process = subprocess.Popen(
            [*compose_cmd, "up", "--build"],
            cwd=str(app_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        running_processes[pipeline_id] = process
        
        # 5. Stream Logs in a separate thread to avoid blocking or NotImplementedError on Windows
        loop = asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            while True:
                line = await loop.run_in_executor(pool, process.stdout.readline)
                if not line:
                    break
                msg = line.strip()
                execution_logs[pipeline_id].append(msg)
                if len(execution_logs[pipeline_id]) > 1000:
                    execution_logs[pipeline_id].pop(0)
            
    except Exception as e:
        logger.error(f"Error running app in Docker {pipeline_id}: {e}\n{traceback.format_exc()}")
        execution_logs[pipeline_id].append(f"[!] Docker Error: {str(e) or 'Check backend logs for details.'}")

@router.post("/{pipeline_id}/run")
async def start_app(pipeline_id: str, background_tasks: BackgroundTasks):
    """Trigger the app execution with Docker."""
    app_dir = RUN_APPS_DIR / pipeline_id
    if pipeline_id in running_processes:
        # Kill existing and cleanup
        subprocess.run([*_docker_compose_command(), "down"], cwd=app_dir)
        try:
            running_processes[pipeline_id].terminate()
        except:
            pass
        del running_processes[pipeline_id]
        
    background_tasks.add_task(run_app_task, pipeline_id)
    return {"status": "started", "message": "App provisioning started in background via Docker."}

@router.get("/{pipeline_id}/logs")
async def get_logs(pipeline_id: str):
    """Get the current execution logs."""
    return {"logs": execution_logs.get(pipeline_id, [])}

@router.post("/{pipeline_id}/stop")
async def stop_app(pipeline_id: str):
    """Stop the running Docker container."""
    app_dir = RUN_APPS_DIR / pipeline_id
    if pipeline_id in running_processes:
        # Run docker-compose down to cleanup
        subprocess.run([*_docker_compose_command(), "down"], cwd=app_dir)
        try:
            running_processes[pipeline_id].terminate()
        except:
            pass
        del running_processes[pipeline_id]
        return {"status": "stopped"}
    return {"status": "not_running"}
