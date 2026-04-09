"""Contracts package — Pydantic schemas for inter-agent communication and artifacts."""

from .messages import (
    AgentRequest,
    AgentResponse,
    CriticFeedback,
    PipelineEvent,
    EventType,
)
from .artifacts import (
    RequirementsDoc,
    ArchitectureDoc,
    TaskBreakdown,
    CodeArtifact,
    DeploymentConfig,
    ReviewReport,
)

__all__ = [
    "AgentRequest",
    "AgentResponse",
    "CriticFeedback",
    "PipelineEvent",
    "EventType",
    "RequirementsDoc",
    "ArchitectureDoc",
    "TaskBreakdown",
    "CodeArtifact",
    "DeploymentConfig",
    "ReviewReport",
]
