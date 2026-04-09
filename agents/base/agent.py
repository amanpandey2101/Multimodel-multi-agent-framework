"""
Abstract BaseAgent — the interface every pipeline agent must implement.

Handles common concerns: prompt construction, input/output validation,
retry logic, telemetry, tool-use conversation loops, and LLM provider
delegation.

The tool-use loop (inspired by open-multi-agent's AgentRunner) works as:
    1. Build prompt → call LLM
    2. If LLM response contains tool_use → execute tool → feed result back
    3. Repeat until LLM returns a final text response (no more tool calls)
"""

from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Optional, Type

from pydantic import BaseModel

from engine.contracts.messages import (
    AgentRequest,
    AgentResponse,
    AgentRole,
    StageStatus,
)
from agents.base.llm_provider import LLMProvider, LLMResponse, Message

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """
    Base class for all pipeline agents.

    Subclasses must implement:
        - ``role``: the canonical AgentRole
        - ``build_prompt(request)``: construct the LLM prompt
        - ``parse_response(raw, request)``: extract structured artifacts

    Optional tool support:
        Pass ``tool_registry`` and ``tool_executor`` to enable tool-use
        conversation loops. The agent will automatically handle tool calls
        from the LLM and feed results back.
    """

    role: AgentRole
    output_schema: Optional[Type[BaseModel]] = None

    def __init__(
        self,
        llm_provider: LLMProvider,
        tool_registry: Optional[Any] = None,
        tool_executor: Optional[Any] = None,
    ):
        self.llm = llm_provider
        self.tool_registry = tool_registry
        self.tool_executor = tool_executor
        self._tool_calls: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(
        self,
        request: AgentRequest,
        *,
        output_schema: Optional[Type[BaseModel]] = None,
        max_retries: int = 2,
        max_tool_turns: int = 15,
    ) -> AgentResponse:
        """
        Run the agent on a structured request.

        1. Build system + user prompts.
        2. Call LLM with optional JSON-mode and tools.
        3. Handle tool-use conversation loop if tools are available.
        4. Parse and validate final output.
        5. Wrap in an AgentResponse.
        """
        start = time.perf_counter_ns()
        messages = self.build_prompt(request)

        # Use explicit schema or fall back to class-level default
        schema = output_schema or self.output_schema

        # Determine response format
        response_format = None
        if schema and not self._has_tools():
            response_format = {"type": "json_object"}

        # Build tools list if available
        tools = None
        if self._has_tools():
            tool_names = self._get_tool_names()
            tools = self.tool_registry.to_llm_tools(tool_names)

        last_error: Optional[Exception] = None
        llm_response: Optional[LLMResponse] = None

        for attempt in range(1, max_retries + 2):
            try:
                llm_response = await self.llm.generate(
                    messages,
                    temperature=self._temperature(),
                    max_tokens=self._max_tokens(),
                    response_format=response_format,
                    tools=tools,
                )
                break
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "[%s] LLM call failed (attempt %d/%d): %s",
                    self.role.value, attempt, max_retries + 1, exc,
                )

        if llm_response is None:
            elapsed = int((time.perf_counter_ns() - start) / 1_000_000)
            return AgentResponse(
                request_id=request.request_id,
                pipeline_id=request.pipeline_id,
                stage=request.stage,
                agent_role=self.role,
                status=StageStatus.FAILED,
                warnings=[f"LLM call failed after {max_retries + 1} attempts: {last_error}"],
                execution_time_ms=elapsed,
                iteration=request.iteration,
            )

        # Tool-use conversation loop
        if self._has_tools() and llm_response.tool_calls:
            llm_response = await self._tool_loop(
                messages, llm_response, max_tool_turns, request,
            )

        # Parse the response
        try:
            artifacts = self.parse_response(llm_response.content, request)
        except Exception as exc:
            logger.error("[%s] Failed to parse LLM output: %s", self.role.value, exc)
            elapsed = int((time.perf_counter_ns() - start) / 1_000_000)
            return AgentResponse(
                request_id=request.request_id,
                pipeline_id=request.pipeline_id,
                stage=request.stage,
                agent_role=self.role,
                status=StageStatus.FAILED,
                warnings=[f"Output parsing failed: {exc}"],
                artifacts={"raw_output": llm_response.content},
                execution_time_ms=elapsed,
                iteration=request.iteration,
            )

        # Validate against output schema if provided
        confidence = self._compute_confidence(artifacts, schema)

        elapsed = int((time.perf_counter_ns() - start) / 1_000_000)
        return AgentResponse(
            request_id=request.request_id,
            pipeline_id=request.pipeline_id,
            stage=request.stage,
            agent_role=self.role,
            status=StageStatus.COMPLETED,
            artifacts=artifacts,
            confidence_score=confidence,
            token_usage={
                "prompt_tokens": llm_response.prompt_tokens,
                "completion_tokens": llm_response.completion_tokens,
                "total_tokens": llm_response.total_tokens,
            },
            execution_time_ms=elapsed,
            iteration=request.iteration,
        )

    async def run(self, prompt: str, system_prompt: str = "") -> dict[str, Any]:
        """
        Simplified run interface for standalone agent usage (team orchestration).

        Returns a dict with 'success', 'output', 'token_usage', 'tool_calls'.
        """
        start = time.perf_counter_ns()
        messages = []
        if system_prompt:
            messages.append(Message(role="system", content=system_prompt))
        messages.append(Message(role="user", content=prompt))

        tools = None
        if self._has_tools():
            tool_names = self._get_tool_names()
            tools = self.tool_registry.to_llm_tools(tool_names)

        try:
            llm_response = await self.llm.generate(
                messages,
                temperature=self._temperature(),
                max_tokens=self._max_tokens(),
                tools=tools,
            )

            # Tool loop
            if self._has_tools() and llm_response.tool_calls:
                llm_response = await self._tool_loop(messages, llm_response, 15)

            elapsed = int((time.perf_counter_ns() - start) / 1_000_000)
            return {
                "success": True,
                "output": llm_response.content,
                "token_usage": {
                    "prompt_tokens": llm_response.prompt_tokens,
                    "completion_tokens": llm_response.completion_tokens,
                    "total_tokens": llm_response.total_tokens,
                },
                "tool_calls": list(self._tool_calls),
                "execution_time_ms": elapsed,
            }
        except Exception as exc:
            elapsed = int((time.perf_counter_ns() - start) / 1_000_000)
            return {
                "success": False,
                "output": str(exc),
                "token_usage": {},
                "tool_calls": [],
                "execution_time_ms": elapsed,
            }

    # ------------------------------------------------------------------
    # Abstract methods — must be implemented by subclasses
    # ------------------------------------------------------------------

    @abstractmethod
    def build_prompt(self, request: AgentRequest) -> list[Message]:
        """
        Construct the messages list (system + user) for the LLM call.

        Typically includes: role-specific system prompt, task description,
        serialised context artifacts, and (if present) critic feedback.
        """
        ...

    @abstractmethod
    def parse_response(self, raw_content: str, request: AgentRequest) -> dict[str, Any]:
        """
        Parse the raw LLM text into a structured artifact dict.

        Subclasses should attempt JSON parsing first, falling back to
        best-effort extraction if the LLM didn't obey JSON mode.
        """
        ...

    # ------------------------------------------------------------------
    # Tool-use conversation loop
    # ------------------------------------------------------------------

    async def _tool_loop(
        self,
        messages: list[Message],
        initial_response: LLMResponse,
        max_turns: int = 15,
        request: Optional[AgentRequest] = None,
    ) -> LLMResponse:
        """
        Handle tool calls in a conversation loop.

        Repeatedly: execute tool → append result → call LLM → check for more tools.
        """
        from agents.tools.registry import ToolContext

        response = initial_response
        conversation = list(messages)
        self._tool_calls = []

        for turn in range(max_turns):
            if not response.tool_calls:
                break

            # Add assistant message with tool calls
            conversation.append(Message(
                role="assistant",
                content=response.content or "",
                tool_calls=response.tool_calls,
            ))

            # Execute each tool call
            for tool_call in response.tool_calls:
                tool_name = tool_call.get("function", {}).get("name", "")
                tool_args_str = tool_call.get("function", {}).get("arguments", "{}")
                tool_id = tool_call.get("id", "")

                try:
                    tool_args = json.loads(tool_args_str) if isinstance(tool_args_str, str) else tool_args_str
                except json.JSONDecodeError:
                    tool_args = {}

                logger.info("[%s] Tool call: %s(%s)", self.role.value, tool_name, json.dumps(tool_args)[:200])

                context = ToolContext(
                    agent_name=self.role.value if hasattr(self, 'role') else "",
                    workspace_dir=getattr(self, '_workspace_dir', ''),
                    pipeline_id=request.pipeline_id if request else "",
                )

                result = await self.tool_executor.execute(tool_name, tool_args, context)

                self._tool_calls.append({
                    "tool": tool_name,
                    "input": tool_args,
                    "output": result.data[:500],
                    "is_error": result.is_error,
                    "execution_time_ms": result.execution_time_ms,
                })

                # Append tool result message
                conversation.append(Message(
                    role="tool",
                    content=result.data,
                    tool_call_id=tool_id,
                ))

            # Call LLM again with updated conversation
            tools = None
            if self._has_tools():
                tool_names = self._get_tool_names()
                tools = self.tool_registry.to_llm_tools(tool_names)

            response = await self.llm.generate(
                conversation,
                temperature=self._temperature(),
                max_tokens=self._max_tokens(),
                tools=tools,
            )

        return response

    def _has_tools(self) -> bool:
        """Check if this agent has tools configured."""
        return self.tool_registry is not None and self.tool_executor is not None

    def _get_tool_names(self) -> Optional[list[str]]:
        """Get the list of tool names this agent can use. Override for per-agent filtering."""
        return None  # None = all tools in registry

    # ------------------------------------------------------------------
    # Helpers (overridable)
    # ------------------------------------------------------------------

    def _format_feedback(self, request: AgentRequest, template: str) -> str:
        """
        Format critic feedback from a request into a string using the given template.

        Returns an empty string if there is no feedback. The template should
        contain a ``{feedback}`` placeholder.
        """
        if not request.critic_feedback:
            return ""
        issues = "\n".join(
            f"- [{i.severity.value}] {i.description}"
            for i in request.critic_feedback.issues
        )
        suggestions = "\n".join(
            f"- {s}" for s in request.critic_feedback.suggestions
        )
        return template.format(
            feedback=f"Issues:\n{issues}\n\nSuggestions:\n{suggestions}"
        )

    def _temperature(self) -> float:
        """Default temperature — agents can override for creativity vs. precision."""
        return 0.4

    def _max_tokens(self) -> int:
        """Default max tokens — agents can override based on expected output size."""
        return 4096

    def _compute_confidence(
        self,
        artifacts: dict[str, Any],
        schema: Optional[Type[BaseModel]],
    ) -> float:
        """
        Heuristic confidence score.

        Returns 1.0 if the output validates against the schema, 0.8 if
        artifacts are non-empty, 0.5 otherwise.
        """
        if schema:
            try:
                schema.model_validate(artifacts)
                return 1.0
            except Exception:
                return 0.6
        return 0.8 if artifacts else 0.5

    @staticmethod
    def _safe_json_parse(text: str) -> dict[str, Any]:
        """Try to parse JSON from LLM output, handling markdown fences."""
        text = text.strip()
        if text.startswith("```"):
            # Strip markdown code fences
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to find JSON object in the text
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
            raise
