"""
Tool Executor — validates inputs, dispatches tools, captures results.

Handles:
    - Input validation against Pydantic schemas
    - Timeout enforcement
    - Error capture and normalisation
    - Execution time measurement
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

from agents.tools.registry import ToolDefinition, ToolResult, ToolRegistry, ToolContext

logger = logging.getLogger(__name__)


class ToolExecutor:
    """
    Executes registered tools with input validation and error handling.

    Usage::

        executor = ToolExecutor(registry)
        result = await executor.execute("bash", {"command": "ls -la"}, context)
    """

    def __init__(
        self,
        registry: ToolRegistry,
        default_timeout: float = 300.0,
    ):
        self.registry = registry
        self.default_timeout = default_timeout
        self._execution_log: list[dict[str, Any]] = []

    async def execute(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        context: Optional[ToolContext] = None,
        timeout: Optional[float] = None,
    ) -> ToolResult:
        """
        Execute a tool by name with the given input.

        Steps:
            1. Look up tool in registry
            2. Validate input against Pydantic schema
            3. Execute with timeout
            4. Capture and return result
        """
        context = context or ToolContext()
        timeout = timeout or self.default_timeout

        # 1. Look up
        tool = self.registry.get(tool_name)
        if tool is None:
            return ToolResult(
                data=f"Error: tool '{tool_name}' not found. "
                     f"Available: {self.registry.list_names()}",
                is_error=True,
            )

        # 2. Validate input
        try:
            validated = tool.input_schema.model_validate(tool_input)
            validated_dict = validated.model_dump()
        except Exception as exc:
            return ToolResult(
                data=f"Input validation error for tool '{tool_name}': {exc}",
                is_error=True,
            )

        # 3. Execute with timeout
        start = time.perf_counter_ns()
        try:
            result = await asyncio.wait_for(
                tool.execute(validated_dict, context),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            elapsed_ms = int((time.perf_counter_ns() - start) / 1_000_000)
            result = ToolResult(
                data=f"Tool '{tool_name}' timed out after {timeout}s",
                is_error=True,
                execution_time_ms=elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = int((time.perf_counter_ns() - start) / 1_000_000)
            logger.error("Tool '%s' raised: %s", tool_name, exc, exc_info=True)
            result = ToolResult(
                data=f"Tool '{tool_name}' error: {exc}",
                is_error=True,
                execution_time_ms=elapsed_ms,
            )

        elapsed_ms = int((time.perf_counter_ns() - start) / 1_000_000)
        if result.execution_time_ms == 0:
            result.execution_time_ms = elapsed_ms

        # 4. Log execution
        log_entry = {
            "tool": tool_name,
            "input": tool_input,
            "is_error": result.is_error,
            "execution_time_ms": result.execution_time_ms,
            "agent": context.agent_name,
            "output_preview": result.data[:200] if result.data else "",
        }
        self._execution_log.append(log_entry)
        logger.info(
            "Tool '%s' executed in %dms (error=%s)",
            tool_name, result.execution_time_ms, result.is_error,
        )

        return result

    @property
    def execution_log(self) -> list[dict[str, Any]]:
        return list(self._execution_log)

    def clear_log(self) -> None:
        self._execution_log.clear()
