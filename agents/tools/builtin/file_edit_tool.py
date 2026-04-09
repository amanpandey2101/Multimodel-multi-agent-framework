"""
File Edit Tool — edit files by replacing exact string matches.

Inspired by claude-source's FileEditTool.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field

from agents.tools.registry import ToolDefinition, ToolResult, ToolContext
from agents.tools.builtin.path_safety import resolve_path


class FileEditInput(BaseModel):
    """Input schema for the file_edit tool."""
    file_path: str = Field(description="Path to the file to edit.")
    old_string: str = Field(description="The exact string to find and replace. Must match exactly.")
    new_string: str = Field(description="The replacement string.")


async def file_edit_execute(input_data: dict[str, Any], context: ToolContext) -> ToolResult:
    """Edit a file by replacing an exact string occurrence."""
    file_path = input_data["file_path"]
    old_string = input_data["old_string"]
    new_string = input_data["new_string"]

    try:
        file_path = resolve_path(file_path, context)
    except ValueError as exc:
        return ToolResult(data=str(exc), is_error=True)

    if not os.path.exists(file_path):
        return ToolResult(data=f"File not found: {file_path}", is_error=True)

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        occurrences = content.count(old_string)
        if occurrences == 0:
            return ToolResult(
                data=f"Error: the string to replace was not found in {file_path}.\n"
                     f"Searched for: {old_string[:200]}",
                is_error=True,
            )

        if occurrences > 1:
            return ToolResult(
                data=f"Error: found {occurrences} occurrences of the string in {file_path}. "
                     f"Please provide a more specific string that matches exactly once.",
                is_error=True,
            )

        new_content = content.replace(old_string, new_string, 1)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        return ToolResult(
            data=f"Successfully edited {file_path}. Replaced 1 occurrence."
        )

    except Exception as exc:
        return ToolResult(data=f"Error editing file: {exc}", is_error=True)


file_edit_tool = ToolDefinition(
    name="file_edit",
    description=(
        "Edit a file by replacing an exact string match with a new string. "
        "The old_string must appear exactly once in the file. "
        "Use file_read first to understand the file structure."
    ),
    input_schema=FileEditInput,
    execute=file_edit_execute,
)
