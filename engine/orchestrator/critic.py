"""
Critic-Loop Controller — structured validation gates with iteration limits.

After each agent produces output, the critic loop routes it to the Reviewer
agent for validation.  If the review fails, the producing agent receives
structured feedback and refines its output.  The loop enforces a configurable
max-iteration limit (default: 3) to prevent infinite refinement.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Awaitable, Optional

from engine.contracts.messages import (
    AgentRequest,
    AgentResponse,
    CriticFeedback,
    AgentRole,
    StageStatus,
)

logger = logging.getLogger(__name__)

# Type alias for the review function
ReviewFn = Callable[..., Awaitable[CriticFeedback]]


class CriticLoopController:
    """
    Controls the critic refinement loop for a pipeline stage.

    Usage::

        critic = CriticLoopController(max_iterations=3)
        final_response = await critic.run(
            agent=engineer_agent,
            request=initial_request,
            review_fn=reviewer.review_artifacts,
        )
    """

    def __init__(self, max_iterations: int = 3, enable: bool = True):
        self.max_iterations = max_iterations
        self.enable = enable
        self._iteration_log: list[dict[str, Any]] = []

    async def run(
        self,
        agent: Any,  # BaseAgent — avoid circular import
        request: AgentRequest,
        review_fn: Optional[ReviewFn] = None,
    ) -> tuple[AgentResponse, list[CriticFeedback]]:
        """
        Execute the agent and optionally refine via critic feedback.

        Returns:
            (final_response, list_of_feedback_from_each_iteration)
        """
        feedbacks: list[CriticFeedback] = []
        current_request = request.model_copy()
        response: Optional[AgentResponse] = None

        for iteration in range(1, self.max_iterations + 1):
            current_request.iteration = iteration
            logger.info(
                "[CriticLoop] Stage=%s, Agent=%s, Iteration=%d/%d",
                request.stage,
                request.agent_role.value,
                iteration,
                self.max_iterations,
            )

            # 1. Execute the agent
            response = await agent.execute(current_request)

            if response.status == StageStatus.FAILED:
                logger.warning(
                    "[CriticLoop] Agent failed at iteration %d: %s",
                    iteration,
                    response.warnings,
                )
                break

            # 2. Skip review if disabled or no review function
            if not self.enable or review_fn is None:
                break

            # 3. Route to critic for review
            try:
                feedback = await review_fn(
                    response.artifacts,
                    request.stage,
                    request.pipeline_id,
                    iteration,
                )
            except TypeError:
                feedback = await review_fn(
                    response.artifacts,
                    request.stage,
                    request.pipeline_id,
                )
            feedback.iteration = iteration
            feedbacks.append(feedback)

            self._iteration_log.append({
                "iteration": iteration,
                "stage": request.stage,
                "approved": feedback.approved,
                "issues_count": len(feedback.issues),
                "suggestions_count": len(feedback.suggestions),
            })

            if feedback.approved:
                logger.info(
                    "[CriticLoop] Stage=%s approved at iteration %d",
                    request.stage,
                    iteration,
                )
                break

            # 4. Not the last iteration — inject feedback for refinement
            if iteration < self.max_iterations:
                logger.info(
                    "[CriticLoop] Stage=%s rejected at iteration %d, refining...",
                    request.stage,
                    iteration,
                )
                current_request = request.model_copy()
                current_request.critic_feedback = feedback
                current_request.context_artifacts = {
                    **request.context_artifacts,
                    f"previous_output_v{iteration}": response.artifacts,
                }
            else:
                logger.warning(
                    "[CriticLoop] Stage=%s reached max iterations (%d), failing quality gate",
                    request.stage,
                    self.max_iterations,
                )
                failed_response = response.model_copy(deep=True)
                failed_response.status = StageStatus.FAILED
                failed_response.warnings = [
                    *response.warnings,
                    f"Rejected by critic after {self.max_iterations} iterations",
                ]
                response = failed_response

        if response is None:
            raise RuntimeError("Critic loop completed without producing a response")

        return response, feedbacks

    @property
    def iteration_log(self) -> list[dict[str, Any]]:
        return list(self._iteration_log)

    def reset(self) -> None:
        self._iteration_log.clear()
