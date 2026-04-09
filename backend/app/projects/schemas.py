"""Project schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
    pipeline_count: int = 0

    model_config = {"from_attributes": True}
