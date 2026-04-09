"""
Bash tool: execute shell commands inside the configured workspace.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from pydantic import BaseModel, Field

from agents.tools.registry import ToolContext, ToolDefinition, ToolResult
from agents.tools.builtin.path_safety import resolve_workspace_root


class BashInput(BaseModel):
    """Input schema for the bash tool."""
    command: str = Field(description="The shell command to execute.")
    timeout: int = Field(
        default=300,
        description="Maximum execution time in seconds (default: 300).",
    )


def _is_restricted_command(command: str) -> bool:
    """Deny clearly destructive commands."""
    lowered = command.lower()
    blocked_tokens = [
        "rm -rf /",
        "rm -rf *",
        "shutdown",
        "reboot",
        "mkfs",
        "format ",
        "del /f /s /q",
        "remove-item -recurse",
    ]
    return any(token in lowered for token in blocked_tokens)


def _fallback_echo(command: str) -> ToolResult | None:
    """Fallback for restricted environments that cannot spawn subprocesses."""
    stripped = command.strip()
    if not stripped.lower().startswith("echo "):
        return None
    payload = stripped[5:].strip()
    if (payload.startswith('"') and payload.endswith('"')) or (
        payload.startswith("'") and payload.endswith("'")
    ):
        payload = payload[1:-1]
    return ToolResult(data=payload)


async def bash_execute(input_data: dict[str, Any], context: ToolContext) -> ToolResult:
    """Execute a shell command and return stdout + stderr."""
    command = input_data["command"]
    timeout = int(input_data.get("timeout", 300))

    if _is_restricted_command(command):
        return ToolResult(
            data="Command blocked by safety policy. Use file tools for workspace-scoped changes.",
            is_error=True,
        )

    workspace = resolve_workspace_root(context)
    cwd = workspace or os.getcwd()

    env = os.environ.copy()
    env["npm_config_yes"] = "true"

    try:
        if os.name == "nt":
            process = await asyncio.create_subprocess_exec(
                "cmd",
                "/d",
                "/s",
                "/c",
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )
        else:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)

        output_parts: list[str] = []
        if stdout:
            output_parts.append(stdout.decode("utf-8", errors="replace"))
        if stderr:
            output_parts.append(f"STDERR:\n{stderr.decode('utf-8', errors='replace')}")

        output = "\n".join(output_parts) if output_parts else "(no output)"
        exit_code = process.returncode
        if exit_code != 0:
            output = f"Exit code: {exit_code}\n{output}"

        if len(output) > 50000:
            output = output[:50000] + "\n\n... (truncated, output too long)"

        return ToolResult(data=output, is_error=exit_code != 0)

    except asyncio.TimeoutError:
        return ToolResult(
            data=f"Command timed out after {timeout} seconds: {command}",
            is_error=True,
        )
    except PermissionError:
        fallback = _fallback_echo(command)
        if fallback is not None:
            return fallback
        return ToolResult(
            data=(
                "Command execution failed due to process sandbox restrictions in this runtime. "
                "Use supported workspace file tools when possible."
            ),
            is_error=True,
        )
    except Exception as exc:
        return ToolResult(data=f"Command execution error: {exc}", is_error=True)


bash_tool = ToolDefinition(
    name="bash",
    description=(
        "Execute a shell command and return stdout and stderr. "
        "Runs from the workspace directory with timeout support."
    ),
    input_schema=BashInput,
    execute=bash_execute,
)
