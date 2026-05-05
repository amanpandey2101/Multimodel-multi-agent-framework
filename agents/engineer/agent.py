"""
Code Engineer Agent — generates implementation code from task breakdown + architecture.
"""

from __future__ import annotations

import json
from typing import Any

from agents.base.agent import BaseAgent
from agents.base.llm_provider import LLMProvider, Message
from engine.contracts.messages import AgentRequest, AgentRole
from engine.contracts.artifacts import CodeArtifact
from agents.engineer.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, FEEDBACK_SECTION


class EngineerAgent(BaseAgent):
    role = AgentRole.ENGINEER
    output_schema = CodeArtifact

    def __init__(self, llm_provider: LLMProvider):
        super().__init__(llm_provider)

    def build_prompt(self, request: AgentRequest) -> list[Message]:
        feedback_section = self._format_feedback(request, FEEDBACK_SECTION)
        mode = str((request.constraints or {}).get("mode", "creation")).lower()
        is_update = bool((request.constraints or {}).get("is_update")) or mode == "evolution"

        requirements = json.dumps(
            request.context_artifacts.get("requirements", {}), indent=2
        )
        architecture = json.dumps(
            request.context_artifacts.get("architecture", {}), indent=2
        )
        task_breakdown = json.dumps(
            request.context_artifacts.get("task_breakdown", {}), indent=2
        )
        implementation = json.dumps(
            request.context_artifacts.get("implementation", {}), indent=2
        )
        constraints_str = json.dumps(request.constraints, indent=2) if request.constraints else "None"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            task_description=request.task_description,
            architecture=architecture,
            task_breakdown=task_breakdown,
            requirements=requirements,
            current_code=implementation,
            constraints=constraints_str,
            mode=mode,
            implementation_directive=(
                "Modify the existing project in place. Return the full contents of every changed or added file only."
                if is_update
                else "Create a complete runnable project scaffold. Include every required source, config, and dependency file."
            ),
            feedback_section=feedback_section,
        )

        return [
            Message(role="system", content=SYSTEM_PROMPT),
            Message(role="user", content=user_prompt),
        ]

    def parse_response(self, raw_content: str, request: AgentRequest) -> dict[str, Any]:
        return self._safe_json_parse(raw_content)

    def _temperature(self) -> float:
        return 0.2  # Code generation should be deterministic

    def _max_tokens(self) -> int:
        return 100000  # Maximum capacity (1 Lakh) for state-of-the-art reasoning models



