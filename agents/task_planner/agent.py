"""
Task Planner Agent — breaks requirements + architecture into implementation tasks.
"""

from __future__ import annotations

import json
from typing import Any

from agents.base.agent import BaseAgent
from agents.base.llm_provider import LLMProvider, Message
from engine.contracts.messages import AgentRequest, AgentRole
from engine.contracts.artifacts import TaskBreakdown
from agents.task_planner.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, FEEDBACK_SECTION


class TaskPlannerAgent(BaseAgent):
    role = AgentRole.TASK_PLANNER
    output_schema = TaskBreakdown

    def __init__(self, llm_provider: LLMProvider):
        super().__init__(llm_provider)

    def build_prompt(self, request: AgentRequest) -> list[Message]:
        feedback_section = self._format_feedback(request, FEEDBACK_SECTION)

        requirements = json.dumps(
            request.context_artifacts.get("requirements", {}), indent=2
        )
        architecture = json.dumps(
            request.context_artifacts.get("architecture", {}), indent=2
        )
        task_breakdown = json.dumps(
            request.context_artifacts.get("task_breakdown", {}), indent=2
        )
        constraints_str = json.dumps(request.constraints, indent=2) if request.constraints else "None"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            task_description=request.task_description,
            requirements=requirements,
            architecture=architecture,
            current_tasks=task_breakdown,
            constraints=constraints_str,
            feedback_section=feedback_section,
        )

        return [
            Message(role="system", content=SYSTEM_PROMPT),
            Message(role="user", content=user_prompt),
        ]

    def parse_response(self, raw_content: str, request: AgentRequest) -> dict[str, Any]:
        return self._safe_json_parse(raw_content)

    def _temperature(self) -> float:
        return 0.3

    def _max_tokens(self) -> int:
        return 6144  # Task breakdowns with subtasks can be lengthy
