"""
File Write Tool — write or create files, auto-creating parent directories.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field

from agents.tools.registry import ToolDefinition, ToolResult, ToolContext
from agents.tools.builtin.path_safety import resolve_path


class FileWriteInput(BaseModel):
    """Input schema for the file_write tool."""
    file_path: str = Field(description="Absolute or relative path for the file to write.")
    content: str = Field(description="Content to write to the file.")
    append: bool = Field(default=False, description="If true, append to existing file instead of overwriting.")


async def file_write_execute(input_data: dict[str, Any], context: ToolContext) -> ToolResult:
    """Write content to a file, creating parent directories if needed."""
    file_path = input_data["file_path"]
    content = input_data["content"]
    append = input_data.get("append", False)

    try:
        file_path = resolve_path(file_path, context)
    except ValueError as exc:
        return ToolResult(data=str(exc), is_error=True)

    try:
        # Create parent directories
        parent = os.path.dirname(file_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        mode = "a" if append else "w"
        with open(file_path, mode, encoding="utf-8") as f:
            f.write(content)

        action = "appended to" if append else "written to"
        size = len(content.encode("utf-8"))
        return ToolResult(
            data=f"Successfully {action} {file_path} ({size} bytes, {content.count(chr(10)) + 1} lines)"
        )

    except Exception as exc:
        return ToolResult(data=f"Error writing file: {exc}", is_error=True)


file_write_tool = ToolDefinition(
    name="file_write",
    description=(
        "Write content to a file. Creates the file and any parent directories "
        "if they don't exist. Can append to existing files."
    ),
    input_schema=FileWriteInput,
    execute=file_write_execute,
)
