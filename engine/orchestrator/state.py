"""
State Manager — persistent pipeline execution state.

Maintains the complete execution context: current stage, all produced
artifacts, iteration history, and inter-agent message log.  Designed
to persist to PostgreSQL (long-term) and Redis (hot cache) but works
in-memory for testing without infrastructure.
"""

from __future__ import annotations

import copy
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class StageSnapshot:
    """Immutable snapshot of a stage's state at a given iteration."""
    stage_id: str
    iteration: int
    status: str
    artifacts: dict[str, Any]
    feedback: Optional[dict[str, Any]] = None
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


@dataclass
class PipelineState:
    """Complete state of a pipeline execution."""
    pipeline_id: str
    project_id: str = ""
    status: str = "pending"          # pending | running | completed | failed
    current_stage: Optional[str] = None
    config: dict[str, Any] = field(default_factory=dict)

    # Stage artifacts (latest version per stage)
    artifacts: dict[str, dict[str, Any]] = field(default_factory=dict)

    # Full iteration history per stage
    history: dict[str, list[StageSnapshot]] = field(default_factory=dict)

    # Inter-agent message log
    message_log: list[dict[str, Any]] = field(default_factory=list)

    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        now = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now


class StateManager:
    """
    In-memory state manager with serialisation support.

    In production, ``save()`` / ``load()`` would delegate to PostgreSQL
    and Redis.  For now, they serialise to / from dicts (suitable for
    JSON or DB JSONB columns).
    """

    def __init__(self) -> None:
        self._states: dict[str, PipelineState] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def create_pipeline(
        self,
        pipeline_id: str,
        project_id: str = "",
        config: Optional[dict[str, Any]] = None,
    ) -> PipelineState:
        """Create and register a new pipeline state."""
        state = PipelineState(
            pipeline_id=pipeline_id,
            project_id=project_id,
            config=config or {},
        )
        self._states[pipeline_id] = state
        logger.info("Created pipeline state: %s", pipeline_id)
        return state

    def get_state(self, pipeline_id: str) -> PipelineState:
        if pipeline_id not in self._states:
            raise KeyError(f"Pipeline '{pipeline_id}' not found in state manager")
        return self._states[pipeline_id]

    # ------------------------------------------------------------------
    # Stage transitions
    # ------------------------------------------------------------------

    def start_stage(self, pipeline_id: str, stage_id: str) -> None:
        state = self.get_state(pipeline_id)
        state.current_stage = stage_id
        state.status = "running"
        state.updated_at = datetime.now(timezone.utc).isoformat()

    def complete_stage(
        self,
        pipeline_id: str,
        stage_id: str,
        artifacts: dict[str, Any],
        iteration: int = 1,
    ) -> None:
        state = self.get_state(pipeline_id)
        state.artifacts[stage_id] = copy.deepcopy(artifacts)

        # Record history snapshot
        snapshot = StageSnapshot(
            stage_id=stage_id,
            iteration=iteration,
            status="completed",
            artifacts=copy.deepcopy(artifacts),
        )
        state.history.setdefault(stage_id, []).append(snapshot)
        state.updated_at = datetime.now(timezone.utc).isoformat()

    def fail_stage(
        self,
        pipeline_id: str,
        stage_id: str,
        error: str,
        iteration: int = 1,
    ) -> None:
        state = self.get_state(pipeline_id)
        snapshot = StageSnapshot(
            stage_id=stage_id,
            iteration=iteration,
            status="failed",
            artifacts={"error": error},
        )
        state.history.setdefault(stage_id, []).append(snapshot)
        state.updated_at = datetime.now(timezone.utc).isoformat()

    def record_feedback(
        self,
        pipeline_id: str,
        stage_id: str,
        feedback: dict[str, Any],
        iteration: int,
    ) -> None:
        """Record critic feedback for a stage iteration."""
        state = self.get_state(pipeline_id)
        snapshot = StageSnapshot(
            stage_id=stage_id,
            iteration=iteration,
            status="reviewing",
            artifacts=state.artifacts.get(stage_id, {}),
            feedback=feedback,
        )
        state.history.setdefault(stage_id, []).append(snapshot)
        state.updated_at = datetime.now(timezone.utc).isoformat()

    def complete_pipeline(self, pipeline_id: str) -> None:
        state = self.get_state(pipeline_id)
        state.status = "completed"
        state.current_stage = None
        state.updated_at = datetime.now(timezone.utc).isoformat()

    def fail_pipeline(self, pipeline_id: str, error: str = "") -> None:
        state = self.get_state(pipeline_id)
        state.status = "failed"
        state.updated_at = datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Message Log
    # ------------------------------------------------------------------

    def log_message(self, pipeline_id: str, message: dict[str, Any]) -> None:
        state = self.get_state(pipeline_id)
        message.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        state.message_log.append(message)

    # ------------------------------------------------------------------
    # Artifact access
    # ------------------------------------------------------------------

    def get_artifacts(self, pipeline_id: str, stage_id: str) -> dict[str, Any]:
        state = self.get_state(pipeline_id)
        return state.artifacts.get(stage_id, {})

    def get_all_artifacts(self, pipeline_id: str) -> dict[str, dict[str, Any]]:
        return dict(self.get_state(pipeline_id).artifacts)

    def get_stage_history(self, pipeline_id: str, stage_id: str) -> list[StageSnapshot]:
        state = self.get_state(pipeline_id)
        return state.history.get(stage_id, [])

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self, pipeline_id: str) -> dict[str, Any]:
        """Serialise pipeline state to a dict (for JSON / DB storage)."""
        state = self.get_state(pipeline_id)
        return {
            "pipeline_id": state.pipeline_id,
            "project_id": state.project_id,
            "status": state.status,
            "current_stage": state.current_stage,
            "config": state.config,
            "artifacts": state.artifacts,
            "history": {
                sid: [
                    {
                        "stage_id": s.stage_id,
                        "iteration": s.iteration,
                        "status": s.status,
                        "artifacts": s.artifacts,
                        "feedback": s.feedback,
                        "timestamp": s.timestamp,
                    }
                    for s in snapshots
                ]
                for sid, snapshots in state.history.items()
            },
            "message_log": state.message_log,
            "created_at": state.created_at,
            "updated_at": state.updated_at,
        }

    def load_from_dict(self, data: dict[str, Any]) -> PipelineState:
        """Restore pipeline state from a serialised dict."""
        state = PipelineState(
            pipeline_id=data["pipeline_id"],
            project_id=data.get("project_id", ""),
            status=data.get("status", "pending"),
            current_stage=data.get("current_stage"),
            config=data.get("config", {}),
            artifacts=data.get("artifacts", {}),
            message_log=data.get("message_log", []),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
        )
        # Restore history
        for sid, snapshots in data.get("history", {}).items():
            state.history[sid] = [
                StageSnapshot(
                    stage_id=s["stage_id"],
                    iteration=s["iteration"],
                    status=s["status"],
                    artifacts=s.get("artifacts", {}),
                    feedback=s.get("feedback"),
                    timestamp=s.get("timestamp", ""),
                )
                for s in snapshots
            ]
        self._states[state.pipeline_id] = state
        return state
