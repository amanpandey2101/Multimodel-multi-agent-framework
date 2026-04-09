"""
Requirements Analyst Agent — transforms raw user input into structured requirements.
"""

from __future__ import annotations

import json
from typing import Any

from agents.base.agent import BaseAgent
from agents.base.llm_provider import LLMProvider, Message
from engine.contracts.messages import AgentRequest, AgentRole
from engine.contracts.artifacts import RequirementsDoc
from agents.requirements_analyst.prompts import (
    SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE,
    FEEDBACK_SECTION,
)


class RequirementsAnalystAgent(BaseAgent):
    role = AgentRole.REQUIREMENTS_ANALYST
    output_schema = RequirementsDoc

    def __init__(self, llm_provider: LLMProvider):
        super().__init__(llm_provider)

    def build_prompt(self, request: AgentRequest) -> list[Message]:
        feedback_section = self._format_feedback(request, FEEDBACK_SECTION)

        constraints_str = json.dumps(request.constraints, indent=2) if request.constraints else "None"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            requirement=request.task_description,
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
        return 0.3  # Requirements should be precise, not creative
