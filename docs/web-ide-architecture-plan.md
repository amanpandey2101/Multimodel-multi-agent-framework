# Status: COMPLETED & DEPLOYED - Next-Gen Web IDE Integration

## 1. Vision & Objectives
**COMPLETED**: The Next.js dashboard has been successfully evolved into a high-fidelity **Interactive Web IDE**. Users can now prompt the Multi-Agent framework directly from the browser, watch files generate in real-time in a VS Code-style workspace, and view a live running preview supported by a **Docker-isolated execution engine**.

## 2. Core Frontend Components
The IDE implements a professional-grade developer experience using:
1. **Monaco Editor (`@monaco-editor/react`)**: Provides the underlying VS Code editing experience with full syntax support.
2. **Virtual File System (VFS)**: Manages real-time state synchronization between the backend agent artifacts and the frontend editor.
3. **Resizable Panes (`react-resizable-panels`)**: Enables flexible workspace layout for Chat, Code, and Preview.
4. **Isolated Runtime (Docker)**: Every application run is provisioned in a fresh, isolated Docker container to ensure security and dependency parity.

---

## 3. Implementation: The Remote Dev Environment (Architecture B)
After evaluating both browser-based and server-based execution, we implemented **Architecture B** with a focus on high-fidelity isolation.

### The Docker-Isolated Runner
*   **How it works**:
    1. The Agent edits files on the server using the `file_edit_tool.py`.
    2. The backend provisions a unique directory for the project under `run_apps/{pipeline_id}`.
    3. A specialized **Runner Service** generates a `Dockerfile` and `docker-compose.yml` tailored for the project (e.g., Node.js/Vite dev environment).
    4. The app is executed inside a **Docker Container** with port mapping.
    5. The backend reverse-proxies the container's dev port (e.g., 3001) to a secure API endpoint: `/api/proxy/3001/`.
*   **Pros**: 
    - **Security**: User code is sandboxed from the host OS.
    - **Persistence**: Database containers (Postgres, Redis) can be spun up alongside the app.
    - **Language Agnostic**: Supports any language that can run in Docker.

---

## 4. Implementation Roadmap (Final Status)

### Phase 1: Real-time Sync - [COMPLETED]
- Implemented Supabase Realtime (Postgres Changes) to stream agent events and file updates.
- Achieved sub-second latency between backend tool execution and frontend editor updates.

### Phase 2: VS Code Interface - [COMPLETED]
- Fully responsive 3-panel layout (Chat | Code | Preview).
- Multi-tab file support and real-time VFS management.

### Phase 3: The Dockerized Runner - [COMPLETED]
- Implemented `backend/app/pipelines/runner.py` for container orchestration.
- Integrated a secure reverse-proxy for the Live Preview iframe.
- Added support for Vite-based development workflows with automatic `--base` path injection for proxy compatibility.

## 5. Mock UI Layout (Mental Model)

```text
+-------------------+--------------------------------+--------------------------------+
|                   | FILE EXPLORER                  | LIVE PREVIEW                   |
|  CHAT INTERFACE   | ├─ src/                        | +----------------------------+ |
|                   | │  ├─ App.tsx                  | |                            | |
|  User: Build a    | │  └─ index.css                | |    Hello, World!           | |
|  todo app.        | +------------------------------+ |                            | |
|                   | MONACO EDITOR (App.tsx)        | |    [ ] Buy milk            | |
|  Agent: Let me    | 1  export default function() { | |    [ ] Read book           | |
|  write the code.. | 2    return <div>...</div>     | |                            | |
|                   | 3  }                           | +----------------------------+ |
+-------------------+--------------------------------+--------------------------------+
```
