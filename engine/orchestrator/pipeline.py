"""
Pipeline Orchestrator — the central control plane.

Receives a user requirement, constructs a deterministic execution DAG,
dispatches each stage to the appropriate agent, collects and validates
outputs, and emits structured events for real-time monitoring.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Callable, Awaitable, Optional

from engine.contracts.messages import (
    AgentRequest,
    AgentResponse,
    AgentRole,
    CriticFeedback,
    EventType,
    PipelineEvent,
    StageStatus,
)
from engine.orchestrator.dag import DAGScheduler, NodeStatus
from engine.orchestrator.state import StateManager
from engine.orchestrator.critic import CriticLoopController

logger = logging.getLogger(__name__)

# Type alias for the event callback (e.g. WebSocket broadcast)
EventCallback = Callable[[PipelineEvent], Awaitable[None]]


# Stage ID → Agent Role mapping
STAGE_AGENT_MAP: dict[str, AgentRole] = {
    "requirements": AgentRole.REQUIREMENTS_ANALYST,
    "architecture": AgentRole.ARCHITECT,
    "task_breakdown": AgentRole.TASK_PLANNER,
    "implementation": AgentRole.ENGINEER,
    "review": AgentRole.REVIEWER,
    "deployment": AgentRole.DEVOPS,
}


def build_default_dag() -> DAGScheduler:
    """
    Construct the default software engineering pipeline DAG.

    REQUIREMENTS → ARCHITECTURE → TASK_BREAKDOWN → IMPLEMENTATION → REVIEW
                                                  → DEPLOYMENT (parallel with REVIEW)
    """
    dag = DAGScheduler()
    dag.add_node("requirements", "Requirements Analysis", "requirements_analyst")
    dag.add_node("architecture", "System Architecture", "architect", deps=["requirements"])
    dag.add_node(
        "task_breakdown", "Task Planning", "task_planner",
        deps=["requirements", "architecture"],
    )
    dag.add_node(
        "implementation", "Code Implementation", "engineer",
        deps=["task_breakdown"],
    )
    dag.add_node("review", "Code Review", "reviewer", deps=["implementation"])
    dag.add_node("deployment", "Deployment Config", "devops", deps=["implementation"])
    return dag


class PipelineOrchestrator:
    """
    Central orchestrator that drives the full pipeline.

    Usage::

        orchestrator = PipelineOrchestrator(
            agents={"requirements_analyst": req_agent, ...},
            state_manager=state_mgr,
            event_callback=ws_broadcast,
        )
        result = await orchestrator.run(
            requirement="Build a TODO app with React",
            project_id="proj-123",
        )
    """

    def __init__(
        self,
        agents: dict[str, Any],           # role_name → BaseAgent instance
        state_manager: StateManager,
        critic_controller: Optional[CriticLoopController] = None,
        event_callback: Optional[EventCallback] = None,
        review_fn: Optional[Any] = None,   # reviewer's review function
    ):
        self.agents = agents
        self.state = state_manager
        self.critic = critic_controller or CriticLoopController()
        self.event_callback = event_callback
        self.review_fn = review_fn

    # ------------------------------------------------------------------
    # Main execution
    # ------------------------------------------------------------------

    async def run(
        self,
        requirement: str,
        project_id: str = "",
        pipeline_id: Optional[str] = None,
        constraints: Optional[dict[str, Any]] = None,
        dag: Optional[DAGScheduler] = None,
    ) -> dict[str, Any]:
        """
        Execute the full pipeline end-to-end.

        Returns a dict with pipeline_id, status, and all artifacts.
        """
        pid = pipeline_id or str(uuid.uuid4())
        dag = dag or build_default_dag()

        # Initialise state
        pipeline_state = self.state.create_pipeline(
            pipeline_id=pid,
            project_id=project_id,
            config={
                "requirement": requirement,
                "constraints": constraints or {},
            },
        )

        await self._emit(PipelineEvent(
            pipeline_id=pid,
            event_type=EventType.PIPELINE_STARTED,
            message=f"Pipeline started for: {requirement[:100]}",
        ))

        # Get topological execution order
        execution_order = dag.topological_sort()
        logger.info("Pipeline %s execution order: %s", pid, execution_order)

        try:
            for stage_id in execution_order:
                node = dag.get_node(stage_id)

                # Check if dependencies failed → skip
                deps_failed = any(
                    dag.get_node(dep).status == NodeStatus.FAILED
                    for dep in node.dependencies
                )
                if deps_failed:
                    dag.mark_skipped(stage_id)
                    logger.warning("Skipping stage %s due to failed dependencies", stage_id)
                    continue

                # Resolve the agent
                agent = self.agents.get(node.agent_role)
                if agent is None:
                    logger.error("No agent registered for role: %s", node.agent_role)
                    dag.mark_failed(stage_id, f"No agent for role: {node.agent_role}")
                    self.state.fail_stage(pid, stage_id, f"No agent for role: {node.agent_role}")
                    continue

                # Gather upstream artifacts
                context = self.state.get_all_artifacts(pid)

                # Build the agent request
                agent_role = STAGE_AGENT_MAP.get(stage_id, AgentRole.ORCHESTRATOR)
                request = AgentRequest(
                    pipeline_id=pid,
                    stage=stage_id,
                    agent_role=agent_role,
                    task_description=requirement if stage_id == "requirements" else (
                        f"Based on the upstream artifacts, perform: {node.name}"
                    ),
                    context_artifacts=context,
                    constraints=constraints or {},
                )

                # Mark running
                dag.mark_running(stage_id)
                self.state.start_stage(pid, stage_id)
                await self._emit(PipelineEvent(
                    pipeline_id=pid,
                    event_type=EventType.STAGE_STARTED,
                    stage=stage_id,
                    agent_role=agent_role,
                    message=f"Stage '{node.name}' started",
                ))

                # Run through critic loop
                response, feedbacks = await self.critic.run(
                    agent=agent,
                    request=request,
                    review_fn=self.review_fn,
                )

                # Record feedbacks
                for fb in feedbacks:
                    self.state.record_feedback(pid, stage_id, fb.model_dump(), fb.iteration)
                    await self._emit(PipelineEvent(
                        pipeline_id=pid,
                        event_type=EventType.CRITIC_ITERATION,
                        stage=stage_id,
                        iteration=fb.iteration,
                        data={"approved": fb.approved, "issues": len(fb.issues)},
                        message=f"Critic: {'approved' if fb.approved else 'rejected'}",
                    ))

                # Update state based on response
                if response.status == StageStatus.COMPLETED:
                    dag.mark_completed(stage_id, response.artifacts)
                    self.state.complete_stage(
                        pid, stage_id, response.artifacts, response.iteration
                    )
                    await self._emit(PipelineEvent(
                        pipeline_id=pid,
                        event_type=EventType.STAGE_COMPLETED,
                        stage=stage_id,
                        agent_role=agent_role,
                        iteration=response.iteration,
                        data={"confidence": response.confidence_score},
                        message=f"Stage '{node.name}' completed",
                    ))
                else:
                    error_msg = "; ".join(response.warnings) if response.warnings else "Unknown error"
                    dag.mark_failed(stage_id, error_msg)
                    self.state.fail_stage(pid, stage_id, error_msg, response.iteration)
                    await self._emit(PipelineEvent(
                        pipeline_id=pid,
                        event_type=EventType.STAGE_FAILED,
                        stage=stage_id,
                        agent_role=agent_role,
                        message=f"Stage '{node.name}' failed: {error_msg}",
                    ))

                # Log inter-agent message
                self.state.log_message(pid, {
                    "stage": stage_id,
                    "role": agent_role.value,
                    "iteration": response.iteration,
                    "status": response.status.value,
                    "token_usage": response.token_usage,
                })

        except Exception as exc:
            logger.exception("Pipeline %s failed with exception", pid)
            self.state.fail_pipeline(pid, str(exc))
            await self._emit(PipelineEvent(
                pipeline_id=pid,
                event_type=EventType.PIPELINE_FAILED,
                message=f"Pipeline failed: {exc}",
            ))
            return {
                "pipeline_id": pid,
                "status": "failed",
                "error": str(exc),
                "artifacts": self.state.get_all_artifacts(pid),
            }

        # Determine final status
        if dag.has_failures():
            self.state.fail_pipeline(pid)
            final_status = "failed"
        else:
            self.state.complete_pipeline(pid)
            final_status = "completed"

        await self._emit(PipelineEvent(
            pipeline_id=pid,
            event_type=(
                EventType.PIPELINE_COMPLETED
                if final_status == "completed"
                else EventType.PIPELINE_FAILED
            ),
            message=f"Pipeline {final_status}",
            data={"dag": dag.to_dict()},
        ))

        return {
            "pipeline_id": pid,
            "status": final_status,
            "artifacts": self.state.get_all_artifacts(pid),
            "dag": dag.to_dict(),
            "execution_log": self.state.to_dict(pid),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _emit(self, event: PipelineEvent) -> None:
        """Emit an event to subscribers (WebSocket, logging, etc.)."""
        logger.info("[Event] %s: %s", event.event_type.value, event.message)
        if self.event_callback:
            try:
                await self.event_callback(event)
            except Exception as exc:
                logger.warning("Event callback failed: %s", exc)
