"""
Tool system for multi-agent framework.

Provides a registry/executor pattern for declaring, registering, and
executing tools that agents can invoke during conversation loops.
Inspired by open-multi-agent's defineTool + ToolRegistry and
claude-source's extensive built-in tool collection.
"""

from agents.tools.registry import (
    ToolDefinition,
    ToolResult,
    ToolRegistry,
    define_tool,
)
from agents.tools.executor import ToolExecutor

__all__ = [
    "ToolDefinition",
    "ToolResult",
    "ToolRegistry",
    "ToolExecutor",
    "define_tool",
]
