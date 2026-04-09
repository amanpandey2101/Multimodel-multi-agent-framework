"""
Tool Registry — declare and manage tools available to agents.

Provides:
    - ``ToolDefinition``: typed descriptor for a single tool
    - ``ToolResult``: normalised output from tool execution
    - ``ToolRegistry``: named collection of tools with LLM-schema export
    - ``define_tool()``: convenience factory for creating tool definitions
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, Optional, Type

from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool Result
# ---------------------------------------------------------------------------

@dataclass
class ToolResult:
    """Normalised result returned by a tool's execute function."""
    data: str
    is_error: bool = False
    execution_time_ms: int = 0


# ---------------------------------------------------------------------------
# Tool Definition
# ---------------------------------------------------------------------------

@dataclass
class ToolDefinition:
    """
    Descriptor for a single tool that agents can invoke.

    Attributes:
        name:           Unique tool name (e.g. 'bash', 'file_read').
        description:    Human-readable description shown to the LLM.
        input_schema:   Pydantic model defining the tool's input parameters.
        execute:        Async callable ``(input_dict, context) -> ToolResult``.
    """
    name: str
    description: str
    input_schema: Type[BaseModel]
    execute: Callable[..., Awaitable[ToolResult]]


# ---------------------------------------------------------------------------
# Tool Context
# ---------------------------------------------------------------------------

@dataclass
class ToolContext:
    """
    Context injected into every tool execution.

    Agents and the executor populate this so tools can make
    informed decisions about the environment.
    """
    agent_name: str = ""
    workspace_dir: str = ""
    pipeline_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Tool Registry
# ---------------------------------------------------------------------------

class ToolRegistry:
    """
    Named collection of tools with LLM-schema export.

    Usage::

        registry = ToolRegistry()
        registry.register(bash_tool)
        registry.register(file_read_tool)

        # Get JSON-schema defs for LLM API calls
        schemas = registry.to_llm_tools()

        # Retrieve a tool by name
        tool = registry.get("bash")
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        """Register a tool. Raises ValueError on duplicate name."""
        if tool.name in self._tools:
            raise ValueError(
                f"ToolRegistry: tool '{tool.name}' already registered. "
                f"Use a unique name or unregister the existing one first."
            )
        self._tools[tool.name] = tool
        logger.debug("Registered tool: %s", tool.name)

    def unregister(self, name: str) -> None:
        """Remove a tool by name. No-op if absent."""
        self._tools.pop(name, None)

    def get(self, name: str) -> Optional[ToolDefinition]:
        """Return tool by name, or None if not found."""
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        return name in self._tools

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def list_names(self) -> list[str]:
        return list(self._tools.keys())

    def to_llm_tools(self, tool_names: Optional[list[str]] = None) -> list[dict[str, Any]]:
        """
        Convert registered tools to the JSON-schema format expected by LLM APIs.

        If ``tool_names`` is provided, only those tools are included.
        Returns a list of dicts with ``name``, ``description``, and ``parameters``.
        """
        tools_to_export = self._tools.values()
        if tool_names:
            tools_to_export = [
                t for t in self._tools.values() if t.name in tool_names
            ]

        result = []
        for tool in tools_to_export:
            schema = tool.input_schema.model_json_schema()
            # Clean up the schema for LLM consumption
            schema.pop("title", None)
            result.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": schema,
                },
            })
        return result

    def to_anthropic_tools(self, tool_names: Optional[list[str]] = None) -> list[dict[str, Any]]:
        """Convert to Anthropic's tool format (input_schema instead of parameters)."""
        tools_to_export = self._tools.values()
        if tool_names:
            tools_to_export = [
                t for t in self._tools.values() if t.name in tool_names
            ]

        result = []
        for tool in tools_to_export:
            schema = tool.input_schema.model_json_schema()
            schema.pop("title", None)
            result.append({
                "name": tool.name,
                "description": tool.description,
                "input_schema": schema,
            })
        return result

    def __len__(self) -> int:
        return len(self._tools)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def define_tool(
    *,
    name: str,
    description: str,
    input_schema: Type[BaseModel],
    execute: Callable[..., Awaitable[ToolResult]],
) -> ToolDefinition:
    """
    Convenience factory for creating a ToolDefinition.

    Example::

        my_tool = define_tool(
            name="echo",
            description="Echo the input message.",
            input_schema=EchoInput,
            execute=echo_execute,
        )
        registry.register(my_tool)
    """
    return ToolDefinition(
        name=name,
        description=description,
        input_schema=input_schema,
        execute=execute,
    )
