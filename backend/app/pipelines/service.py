"""
Pipeline execution service: FastAPI background task runner.

Writes events to `pipeline_events` so Supabase Realtime can stream updates
to frontend clients.
"""

from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from backend.app.config import get_settings
from backend.app.supabase_client import get_supabase
from engine.contracts.messages import AgentRequest, AgentRole, StageStatus
from engine.orchestrator.critic import CriticLoopController

logger = logging.getLogger(__name__)


def _emit_event(
    pipeline_id: str,
    event_type: str,
    message: str,
    stage: str = "",
    data: dict[str, Any] | None = None,
) -> None:
    """Insert an event into pipeline_events."""
    try:
        supabase = get_supabase()
        supabase.table("pipeline_events").insert({
            "pipeline_id": pipeline_id,
            "event_type": event_type,
            "stage": stage,
            "message": message,
            "data": data or {},
        }).execute()
    except Exception as exc:
        logger.warning("Failed to emit event: %s", exc)


def _update_stage(pipeline_id: str, stage_name: str, status: str, **extra: Any) -> None:
    """Update a pipeline stage status record."""
    supabase = get_supabase()
    update = {"status": status, **extra}
    (
        supabase.table("pipeline_stages")
        .update(update)
        .eq("pipeline_id", pipeline_id)
        .eq("stage_name", stage_name)
        .execute()
    )


def _save_artifact(
    pipeline_id: str,
    stage_name: str,
    artifact_type: str,
    content: dict[str, Any],
    version: int = 1,
) -> None:
    """Save an artifact to the database."""
    supabase = get_supabase()
    supabase.table("artifacts").insert({
        "pipeline_id": pipeline_id,
        "stage_name": stage_name,
        "artifact_type": artifact_type,
        "content": content,
        "version": version,
    }).execute()
    _emit_event(pipeline_id, "artifact_produced", f"Artifact produced: {artifact_type}", stage=stage_name)


def _resolve_api_key(provider_name: str, settings: Any) -> str | None:
    if provider_name == "openai":
        return settings.openai_api_key
    if provider_name == "anthropic":
        return settings.anthropic_api_key
    if provider_name == "google":
        return settings.google_api_key
    return None


async def run_pipeline_task(pipeline_id: str) -> None:
    """
    Execute all pipeline stages sequentially in a background task.
    """
    supabase = get_supabase()

    try:
        supabase.table("pipelines").update({"status": "running"}).eq("id", pipeline_id).execute()
        _emit_event(pipeline_id, "pipeline_started", "Pipeline execution started")

        pipe = (
            supabase.table("pipelines")
            .select("*")
            .eq("id", pipeline_id)
            .single()
            .execute()
        )
        pipe_data = pipe.data
        config = pipe_data.get("config", {}) or {}
        settings = get_settings()

        provider_name = pipe_data.get("llm_provider", settings.default_llm_provider)
        model_name = pipe_data.get("llm_model", "")
        requirement = pipe_data.get("requirement", "")
        api_key = _resolve_api_key(provider_name, settings)

        current = supabase.table("pipelines").select("status").eq("id", pipeline_id).single().execute()
        if current.data["status"] == "cancelled":
            return

        from agents.architect.agent import ArchitectAgent
        from agents.base.llm_provider import create_provider
        from agents.devops.agent import DevOpsAgent
        from agents.engineer.agent import EngineerAgent
        from agents.requirements_analyst.agent import RequirementsAnalystAgent
        from agents.reviewer.agent import ReviewerAgent
        from agents.task_planner.agent import TaskPlannerAgent

        provider = create_provider(
            provider_name,
            api_key=api_key,
            default_model=model_name or None,
        )

        reviewer = ReviewerAgent(provider)
        max_iterations = max(1, int(config.get("max_iterations", settings.max_critic_iterations)))
        enable_critic = bool(config.get("enable_critic", True))
        critic = CriticLoopController(max_iterations=max_iterations, enable=enable_critic)

        stage_agents = [
            ("requirements", RequirementsAnalystAgent(provider), AgentRole.REQUIREMENTS_ANALYST),
            ("architecture", ArchitectAgent(provider), AgentRole.ARCHITECT),
            ("task_breakdown", TaskPlannerAgent(provider), AgentRole.TASK_PLANNER),
            ("implementation", EngineerAgent(provider), AgentRole.ENGINEER),
            ("review", reviewer, AgentRole.REVIEWER),
            ("deployment", DevOpsAgent(provider), AgentRole.DEVOPS),
        ]

        accumulated_context: dict[str, Any] = {}

        for stage_name, agent, role in stage_agents:
            current = supabase.table("pipelines").select("status").eq("id", pipeline_id).single().execute()
            if current.data["status"] == "cancelled":
                _emit_event(pipeline_id, "pipeline_cancelled", "Pipeline was cancelled")
                return

            started_at = datetime.now(timezone.utc).isoformat()
            _update_stage(pipeline_id, stage_name, "running", started_at=started_at)
            _emit_event(pipeline_id, "stage_started", f"Stage started: {stage_name}", stage=stage_name)

            try:
                request = AgentRequest(
                    pipeline_id=pipeline_id,
                    stage=stage_name,
                    agent_role=role,
                    task_description=(
                        requirement
                        if stage_name == "requirements"
                        else f"Based on the upstream artifacts, perform: {stage_name}"
                    ),
                    context_artifacts=accumulated_context,
                    constraints=config.get("constraints", {}),
                )

                review_fn = reviewer.review_artifacts if (enable_critic and stage_name != "review") else None
                response, feedbacks = await critic.run(agent=agent, request=request, review_fn=review_fn)

                for fb in feedbacks:
                    _emit_event(
                        pipeline_id,
                        "critic_iteration",
                        f"Critic {'approved' if fb.approved else 'rejected'} stage {stage_name}",
                        stage=stage_name,
                        data={"iteration": fb.iteration, "approved": fb.approved, "issues": len(fb.issues)},
                    )

                succeeded = response.status == StageStatus.COMPLETED
                if succeeded and response.artifacts:
                    accumulated_context[stage_name] = response.artifacts
                    _save_artifact(pipeline_id, stage_name, stage_name, response.artifacts)

                completed_at = datetime.now(timezone.utc).isoformat()
                _update_stage(
                    pipeline_id,
                    stage_name,
                    "completed" if succeeded else "failed",
                    completed_at=completed_at,
                    iteration=response.iteration,
                    output_data=response.artifacts if succeeded else {},
                )
                _emit_event(
                    pipeline_id,
                    "stage_completed" if succeeded else "stage_failed",
                    f"Stage {'completed' if succeeded else 'failed'}: {stage_name}",
                    stage=stage_name,
                )

                if not succeeded:
                    error_msg = "; ".join(response.warnings) if response.warnings else "Unknown error"
                    raise RuntimeError(f"Stage {stage_name} failed: {error_msg}")

            except Exception as exc:
                completed_at = datetime.now(timezone.utc).isoformat()
                _update_stage(pipeline_id, stage_name, "failed", completed_at=completed_at)
                _emit_event(pipeline_id, "stage_failed", f"Stage failed: {stage_name} - {exc}", stage=stage_name)
                raise

        completed_at = datetime.now(timezone.utc).isoformat()
        supabase.table("pipelines").update({
            "status": "completed",
            "completed_at": completed_at,
        }).eq("id", pipeline_id).execute()
        _emit_event(pipeline_id, "pipeline_completed", "Pipeline completed successfully")

    except Exception as exc:
        logger.error("Pipeline %s failed: %s\n%s", pipeline_id, exc, traceback.format_exc())
        supabase.table("pipelines").update({"status": "failed"}).eq("id", pipeline_id).execute()
        _emit_event(pipeline_id, "pipeline_failed", f"Pipeline failed: {exc}")
