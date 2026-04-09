"""
File Read Tool — read file contents with offset/limit support.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field

from agents.tools.registry import ToolDefinition, ToolResult, ToolContext
from agents.tools.builtin.path_safety import resolve_path


class FileReadInput(BaseModel):
    """Input schema for the file_read tool."""
    file_path: str = Field(description="Absolute or relative path to the file to read.")
    offset: int = Field(default=0, description="Line offset to start reading from (0-indexed).")
    limit: int = Field(default=0, description="Max number of lines to read. 0 = read all.")


async def file_read_execute(input_data: dict[str, Any], context: ToolContext) -> ToolResult:
    """Read file contents, optionally with offset and limit."""
    file_path = input_data["file_path"]
    offset = input_data.get("offset", 0)
    limit = input_data.get("limit", 0)

    try:
        file_path = resolve_path(file_path, context)
    except ValueError as exc:
        return ToolResult(data=str(exc), is_error=True)

    if not os.path.exists(file_path):
        return ToolResult(data=f"File not found: {file_path}", is_error=True)

    if not os.path.isfile(file_path):
        return ToolResult(data=f"Not a file: {file_path}", is_error=True)

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        total_lines = len(lines)

        if offset > 0:
            lines = lines[offset:]
        if limit > 0:
            lines = lines[:limit]

        content = "".join(lines)

        # Truncate very large files
        if len(content) > 100000:
            content = content[:100000] + "\n\n... (truncated, file too large)"

        header = f"File: {file_path} ({total_lines} lines total)"
        if offset > 0 or limit > 0:
            shown = len(lines)
            header += f", showing lines {offset + 1}-{offset + shown}"

        return ToolResult(data=f"{header}\n\n{content}")

    except Exception as exc:
        return ToolResult(data=f"Error reading file: {exc}", is_error=True)


file_read_tool = ToolDefinition(
    name="file_read",
    description=(
        "Read the contents of a file at the given path. "
        "Supports offset and limit for reading specific line ranges of large files."
    ),
    input_schema=FileReadInput,
    execute=file_read_execute,
)
