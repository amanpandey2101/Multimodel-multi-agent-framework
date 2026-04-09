"""
Artifact type definitions for the software engineering pipeline.

Each pipeline stage produces a specific artifact type. These Pydantic models
define the expected structure so downstream consumers and the critic loop
can validate outputs deterministically.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------

class Priority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class UserStory(BaseModel):
    """A single user story derived from requirements analysis."""
    id: str
    title: str
    description: str
    acceptance_criteria: list[str] = Field(default_factory=list)
    priority: Priority = Priority.MEDIUM


class FunctionalRequirement(BaseModel):
    id: str
    title: str
    description: str
    acceptance_criteria: list[str] = Field(default_factory=list)
    priority: Priority = Priority.MEDIUM


class NonFunctionalRequirement(BaseModel):
    id: str
    category: str = Field(description="e.g. performance, security, scalability, usability")
    description: str
    metric: Optional[str] = None
    target: Optional[str] = None


class RequirementsDoc(BaseModel):
    """Structured requirements produced by the Requirements Analyst."""
    summary: str
    functional_requirements: list[FunctionalRequirement] = Field(default_factory=list)
    non_functional_requirements: list[NonFunctionalRequirement] = Field(default_factory=list)
    user_stories: list[UserStory] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Architecture
# ---------------------------------------------------------------------------

class ComponentSpec(BaseModel):
    """Specification of a single system component."""
    name: str
    responsibility: str
    technology: str = ""
    interfaces: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class APIEndpoint(BaseModel):
    """Definition of a REST API endpoint."""
    method: str
    path: str
    description: str
    request_schema: Optional[dict[str, Any]] = None
    response_schema: Optional[dict[str, Any]] = None


class DataModelField(BaseModel):
    name: str
    type: str
    description: str = ""
    nullable: bool = False
    primary_key: bool = False


class DataModel(BaseModel):
    name: str
    description: str = ""
    fields: list[DataModelField] = Field(default_factory=list)
    relationships: list[str] = Field(default_factory=list)


class ArchitectureDoc(BaseModel):
    """Structured architecture produced by the System Architect."""
    summary: str
    components: list[ComponentSpec] = Field(default_factory=list)
    tech_stack: dict[str, str] = Field(
        default_factory=dict,
        description="Category → technology, e.g. {'backend': 'FastAPI', 'database': 'PostgreSQL'}",
    )
    api_endpoints: list[APIEndpoint] = Field(default_factory=list)
    data_models: list[DataModel] = Field(default_factory=list)
    security_considerations: list[str] = Field(default_factory=list)
    deployment_strategy: str = ""


# ---------------------------------------------------------------------------
# Task Breakdown
# ---------------------------------------------------------------------------

class TaskNode(BaseModel):
    """Single task in the hierarchical task breakdown."""
    id: str
    title: str
    description: str
    priority: Priority = Priority.MEDIUM
    estimated_complexity: str = Field(
        default="medium",
        description="low | medium | high | very_high",
    )
    dependencies: list[str] = Field(
        default_factory=list,
        description="IDs of tasks this task depends on.",
    )
    subtasks: list["TaskNode"] = Field(default_factory=list)
    assigned_component: Optional[str] = None


class TaskBreakdown(BaseModel):
    """Hierarchical task breakdown produced by the Task Planner."""
    summary: str
    tasks: list[TaskNode] = Field(default_factory=list)
    implementation_order: list[str] = Field(
        default_factory=list,
        description="Topologically sorted list of task IDs.",
    )
    total_estimated_effort: str = ""


# ---------------------------------------------------------------------------
# Code
# ---------------------------------------------------------------------------

class CodeFile(BaseModel):
    """A single generated source file."""
    path: str
    language: str
    content: str
    purpose: str = ""
    is_test: bool = False


class CodeArtifact(BaseModel):
    """Code output produced by the Engineer agent."""
    summary: str
    files: list[CodeFile] = Field(default_factory=list)
    entry_point: Optional[str] = None
    build_instructions: str = ""


# ---------------------------------------------------------------------------
# Deployment
# ---------------------------------------------------------------------------

class DeploymentConfig(BaseModel):
    """Deployment configuration produced by the DevOps agent."""
    summary: str
    dockerfile: Optional[str] = None
    docker_compose: Optional[str] = None
    ci_cd_pipeline: Optional[str] = None
    environment_variables: dict[str, str] = Field(default_factory=dict)
    infrastructure_notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------

class ReviewFinding(BaseModel):
    """A single code-review finding."""
    severity: str = Field(description="info | warning | error | critical")
    category: str = Field(description="e.g. bug, security, performance, style")
    file_path: Optional[str] = None
    line_range: Optional[str] = None
    description: str
    suggestion: str = ""


class ReviewReport(BaseModel):
    """Code review report produced by the Reviewer agent."""
    summary: str
    approved: bool = False
    findings: list[ReviewFinding] = Field(default_factory=list)
    overall_quality_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
    )
    recommendations: list[str] = Field(default_factory=list)


# Allow forward refs
TaskNode.model_rebuild()
