"""
Code Reviewer Agent — validates artifacts and provides structured feedback.

This agent serves dual roles:
1. As a pipeline stage (final code review)
2. As the critic loop reviewer (called by CriticLoopController)
"""

from __future__ import annotations

import json
from typing import Any

from agents.base.agent import BaseAgent
from agents.base.llm_provider import LLMProvider, Message
from engine.contracts.messages import (
    AgentRequest,
    AgentResponse,
    AgentRole,
    CriticFeedback,
    ReviewIssue,
    Severity,
)
from engine.contracts.artifacts import ReviewReport
from agents.reviewer.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE


class ReviewerAgent(BaseAgent):
    role = AgentRole.REVIEWER
    output_schema = ReviewReport

    def __init__(self, llm_provider: LLMProvider):
        super().__init__(llm_provider)

    def build_prompt(self, request: AgentRequest) -> list[Message]:
        artifacts_str = json.dumps(
            request.context_artifacts.get("implementation", request.context_artifacts),
            indent=2,
        )
        context_str = json.dumps(
            {k: v for k, v in request.context_artifacts.items() if k != "implementation"},
            indent=2,
        )

        user_prompt = USER_PROMPT_TEMPLATE.format(
            stage=request.stage,
            artifacts=artifacts_str,
            context=context_str,
        )

        return [
            Message(role="system", content=SYSTEM_PROMPT),
            Message(role="user", content=user_prompt),
        ]

    def parse_response(self, raw_content: str, request: AgentRequest) -> dict[str, Any]:
        return self._safe_json_parse(raw_content)

    def _temperature(self) -> float:
        return 0.2  # Reviews should be consistent and precise

    # ------------------------------------------------------------------
    # Critic-loop interface
    # ------------------------------------------------------------------

    async def review_artifacts(
        self,
        artifacts: dict[str, Any],
        stage: str,
        pipeline_id: str,
        iteration: int = 1,
    ) -> CriticFeedback:
        """
        Review artifacts and return structured CriticFeedback.

        This method is passed to the CriticLoopController as the review_fn.
        """
        request = AgentRequest(
            pipeline_id=pipeline_id,
            stage=stage,
            agent_role=AgentRole.REVIEWER,
            task_description=f"Review the output of stage '{stage}'",
            context_artifacts=artifacts,
        )

        response = await self.execute(request)

        # Convert the review report into CriticFeedback
        review_data = response.artifacts
        issues: list[ReviewIssue] = []
        for finding in review_data.get("findings", []):
            severity_str = finding.get("severity", "info").lower()
            try:
                severity = Severity(severity_str)
            except ValueError:
                severity = Severity.INFO

            issues.append(ReviewIssue(
                severity=severity,
                category=finding.get("category", "general"),
                description=finding.get("description", ""),
                location=finding.get("file_path"),
                suggestion=finding.get("suggestion"),
            ))

        return CriticFeedback(
            pipeline_id=pipeline_id,
            stage=stage,
            iteration=iteration,
            approved=review_data.get("approved", False),
            issues=issues,
            suggestions=review_data.get("recommendations", []),
            overall_comment=review_data.get("summary", ""),
        )
