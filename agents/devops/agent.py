"""
DevOps Engineer Agent — generates deployment configurations.
"""

from __future__ import annotations

import json
from typing import Any

from agents.base.agent import BaseAgent
from agents.base.llm_provider import LLMProvider, Message
from engine.contracts.messages import AgentRequest, AgentRole
from engine.contracts.artifacts import DeploymentConfig
from agents.devops.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, FEEDBACK_SECTION


class DevOpsAgent(BaseAgent):
    role = AgentRole.DEVOPS
    output_schema = DeploymentConfig

    def __init__(self, llm_provider: LLMProvider):
        super().__init__(llm_provider)

    def build_prompt(self, request: AgentRequest) -> list[Message]:
        feedback_section = self._format_feedback(request, FEEDBACK_SECTION)

        architecture = json.dumps(
            request.context_artifacts.get("architecture", {}), indent=2
        )
        code_artifacts = request.context_artifacts.get("implementation", {})
        # Summarise code rather than sending full content (token efficiency)
        code_summary = json.dumps(
            {
                "files": [
                    {"path": f.get("path", ""), "language": f.get("language", ""), "purpose": f.get("purpose", "")}
                    for f in code_artifacts.get("files", [])
                ] if isinstance(code_artifacts.get("files"), list) else [],
                "entry_point": code_artifacts.get("entry_point", ""),
            },
            indent=2,
        )
        constraints_str = json.dumps(request.constraints, indent=2) if request.constraints else "None"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            architecture=architecture,
            code_summary=code_summary,
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
        return 0.2

    def _max_tokens(self) -> int:
        return 6144  # Dockerfiles + compose + CI/CD pipelines need room
