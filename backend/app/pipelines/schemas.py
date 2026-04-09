"""Pipeline schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PipelineCreate(BaseModel):
    project_id: str
    requirement: str = Field(min_length=1)
    llm_provider: str = "openai"
    llm_model: str = ""
    enable_critic: bool = True
    max_iterations: int = 3


class PipelineResponse(BaseModel):
    id: str
    project_id: str
    status: str
    requirement: str
    llm_provider: str
    llm_model: str
    config: dict
    created_at: datetime
    completed_at: Optional[datetime] = None
    stages: list["StageResponse"] = []

    model_config = {"from_attributes": True}


class StageResponse(BaseModel):
    id: str
    stage_name: str
    status: str
    agent_role: str
    iteration: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PipelineListResponse(BaseModel):
    id: str
    project_id: str
    status: str
    requirement: str
    llm_provider: str
    created_at: datetime

    model_config = {"from_attributes": True}
