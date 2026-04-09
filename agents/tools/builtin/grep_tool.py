"""
Grep Tool — search file contents with regex support.

Falls back to Python's re module (no external dependencies).
"""

from __future__ import annotations

import os
import re
from typing import Any

from pydantic import BaseModel, Field

from agents.tools.registry import ToolDefinition, ToolResult, ToolContext
from agents.tools.builtin.path_safety import resolve_path


class GrepInput(BaseModel):
    """Input schema for the grep tool."""
    pattern: str = Field(description="The regex pattern to search for.")
    path: str = Field(description="File or directory path to search in.")
    include: str = Field(default="", description="Glob pattern to filter files (e.g. '*.py'). Only used when path is a directory.")
    case_insensitive: bool = Field(default=False, description="If true, performs case-insensitive search.")
    max_results: int = Field(default=50, description="Maximum number of matches to return.")


async def grep_execute(input_data: dict[str, Any], context: ToolContext) -> ToolResult:
    """Search for a pattern in files."""
    pattern = input_data["pattern"]
    path = input_data["path"]
    include = input_data.get("include", "")
    case_insensitive = input_data.get("case_insensitive", False)
    max_results = input_data.get("max_results", 50)

    try:
        path = resolve_path(path, context)
    except ValueError as exc:
        return ToolResult(data=str(exc), is_error=True)

    if not os.path.exists(path):
        return ToolResult(data=f"Path not found: {path}", is_error=True)

    flags = re.IGNORECASE if case_insensitive else 0
    try:
        compiled = re.compile(pattern, flags)
    except re.error as exc:
        return ToolResult(data=f"Invalid regex pattern: {exc}", is_error=True)

    matches: list[str] = []

    def search_file(filepath: str) -> None:
        """Search a single file for the pattern."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                for line_num, line in enumerate(f, 1):
                    if len(matches) >= max_results:
                        return
                    if compiled.search(line):
                        rel_path = os.path.relpath(filepath, context.workspace_dir or os.getcwd())
                        matches.append(f"{rel_path}:{line_num}: {line.rstrip()}")
        except (OSError, UnicodeDecodeError):
            pass  # Skip binary/unreadable files

    if os.path.isfile(path):
        search_file(path)
    else:
        # Walk directory
        import fnmatch
        for root, dirs, files in os.walk(path):
            # Skip common non-useful directories
            dirs[:] = [d for d in dirs if d not in {
                ".git", "__pycache__", "node_modules", ".next",
                ".venv", "venv", ".mypy_cache", ".pytest_cache",
            }]
            for filename in sorted(files):
                if len(matches) >= max_results:
                    break
                if include and not fnmatch.fnmatch(filename, include):
                    continue
                filepath = os.path.join(root, filename)
                search_file(filepath)

    if not matches:
        return ToolResult(data=f"No matches found for pattern: {pattern}")

    result_text = "\n".join(matches)
    header = f"Found {len(matches)} match(es)"
    if len(matches) >= max_results:
        header += f" (capped at {max_results})"

    return ToolResult(data=f"{header}:\n\n{result_text}")


grep_tool = ToolDefinition(
    name="grep",
    description=(
        "Search for a regex pattern in file(s). Can search a single file "
        "or recursively search a directory. Returns matching lines with "
        "file paths and line numbers."
    ),
    input_schema=GrepInput,
    execute=grep_execute,
)
