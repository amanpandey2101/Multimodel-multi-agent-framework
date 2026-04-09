"""
Pydantic-based message schemas for all inter-agent communication.

Every message flowing through the orchestration engine conforms to one of
these contracts, ensuring strict JSON-based, validated communication between
all components — one of the architectural advantages over MetaGPT's
unstructured shared message pool.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AgentRole(str, Enum):
    """Canonical roles for all agents in the pipeline."""
    REQUIREMENTS_ANALYST = "requirements_analyst"
    ARCHITECT = "architect"
    TASK_PLANNER = "task_planner"
    ENGINEER = "engineer"
    REVIEWER = "reviewer"
    DEVOPS = "devops"
    ORCHESTRATOR = "orchestrator"
    COORDINATOR = "coordinator"


class StageStatus(str, Enum):
    """Lifecycle status of a pipeline stage."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    REVIEWING = "reviewing"


class EventType(str, Enum):
    """Types of events emitted on the WebSocket stream."""
    PIPELINE_STARTED = "pipeline_started"
    STAGE_STARTED = "stage_started"
    STAGE_COMPLETED = "stage_completed"
    STAGE_FAILED = "stage_failed"
    CRITIC_ITERATION = "critic_iteration"
    ARTIFACT_PRODUCED = "artifact_produced"
    PIPELINE_COMPLETED = "pipeline_completed"
    PIPELINE_FAILED = "pipeline_failed"
    LOG = "log"
    # Team orchestration events
    TEAM_CREATED = "team_created"
    TASK_DECOMPOSED = "task_decomposed"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    AGENT_STARTED = "agent_started"
    AGENT_COMPLETED = "agent_completed"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"


class Severity(str, Enum):
    """Log / review-issue severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


# ---------------------------------------------------------------------------
# Core Messages
# ---------------------------------------------------------------------------

class AgentRequest(BaseModel):
    """Structured input dispatched *to* an agent by the orchestrator."""

    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pipeline_id: str
    stage: str
    agent_role: AgentRole
    task_description: str
    context_artifacts: dict[str, Any] = Field(
        default_factory=dict,
        description="Upstream artifacts the agent may reference.",
    )
    constraints: dict[str, Any] = Field(
        default_factory=dict,
        description="Hard constraints (e.g. tech-stack, max files).",
    )
    iteration: int = Field(default=1, ge=1)
    critic_feedback: Optional["CriticFeedback"] = Field(
        default=None,
        description="Feedback from previous critic review if this is a refinement iteration.",
    )
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentResponse(BaseModel):
    """Structured output returned *from* an agent to the orchestrator."""

    response_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_id: str
    pipeline_id: str
    stage: str
    agent_role: AgentRole
    status: StageStatus
    artifacts: dict[str, Any] = Field(
        default_factory=dict,
        description="Output artifacts produced by this agent.",
    )
    confidence_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Agent self-assessed confidence in the output.",
    )
    warnings: list[str] = Field(default_factory=list)
    token_usage: dict[str, int] = Field(
        default_factory=dict,
        description="Token counts: prompt_tokens, completion_tokens, total_tokens.",
    )
    execution_time_ms: int = Field(
        default=0,
        description="Wall-clock execution time in milliseconds.",
    )
    iteration: int = Field(default=1, ge=1)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CriticFeedback(BaseModel):
    """Structured review produced by the critic (Reviewer agent)."""

    feedback_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pipeline_id: str
    stage: str
    iteration: int = Field(default=1, ge=1)
    approved: bool = False
    issues: list["ReviewIssue"] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    overall_comment: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReviewIssue(BaseModel):
    """A single issue raised during a critic review."""
    severity: Severity
    category: str = Field(description="e.g. 'schema_compliance', 'consistency', 'completeness'")
    description: str
    location: Optional[str] = Field(default=None, description="File path or artifact key.")
    suggestion: Optional[str] = None


class PipelineEvent(BaseModel):
    """Event schema emitted via WebSocket for real-time monitoring."""

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pipeline_id: str
    event_type: EventType
    stage: Optional[str] = None
    agent_role: Optional[AgentRole] = None
    iteration: Optional[int] = None
    data: dict[str, Any] = Field(default_factory=dict)
    message: str = ""
    severity: Severity = Severity.INFO
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Allow forward references to resolve
AgentRequest.model_rebuild()
