"""
Workspace path safety helpers for built-in tools.
"""

from __future__ import annotations

import os

from agents.tools.registry import ToolContext


def resolve_workspace_root(context: ToolContext) -> str:
    """Return absolute workspace root if provided, else empty string."""
    if not context.workspace_dir:
        return ""
    return os.path.abspath(context.workspace_dir)


def resolve_path(path: str, context: ToolContext) -> str:
    """
    Resolve a file path and enforce workspace containment when workspace is set.

    If no workspace is set, this behaves like a normal absolute-path resolver.
    """
    workspace = resolve_workspace_root(context)
    base = workspace or os.getcwd()
    resolved = os.path.abspath(path if os.path.isabs(path) else os.path.join(base, path))

    if workspace:
        try:
            common = os.path.commonpath([workspace, resolved])
        except ValueError:
            raise ValueError(f"Path is outside workspace: {resolved}")
        if common != workspace:
            raise ValueError(f"Path is outside workspace: {resolved}")

    return resolved
