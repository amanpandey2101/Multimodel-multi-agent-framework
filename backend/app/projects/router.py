"""
Projects API router — CRUD using Supabase client.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.app.supabase_client import get_supabase_dependency
from backend.app.auth.dependencies import get_current_user
from supabase import Client

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.post("/")
async def create_project(
    body: ProjectCreate,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Create a new project."""
    result = (
        supabase.table("projects")
        .insert({
            "name": body.name,
            "description": body.description,
            "owner_id": user["id"],
        })
        .execute()
    )
    return result.data[0]


@router.get("/")
async def list_projects(
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """List all projects owned by the current user."""
    result = (
        supabase.table("projects")
        .select("*, pipelines(count)")
        .eq("owner_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )

    projects = []
    for row in result.data:
        pipeline_count = 0
        if row.get("pipelines"):
            pipeline_count = row["pipelines"][0].get("count", 0) if row["pipelines"] else 0
        projects.append({
            **{k: v for k, v in row.items() if k != "pipelines"},
            "pipeline_count": pipeline_count,
        })
    return projects


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Get a specific project."""
    result = (
        supabase.table("projects")
        .select("*, pipelines(count)")
        .eq("id", project_id)
        .eq("owner_id", user["id"])
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    row = result.data
    pipeline_count = 0
    if row.get("pipelines"):
        pipeline_count = row["pipelines"][0].get("count", 0) if row["pipelines"] else 0

    return {
        **{k: v for k, v in row.items() if k != "pipelines"},
        "pipeline_count": pipeline_count,
    }


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Update a project."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("projects")
        .update(updates)
        .eq("id", project_id)
        .eq("owner_id", user["id"])
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    return result.data[0]


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Delete a project and all its pipelines."""
    result = (
        supabase.table("projects")
        .delete()
        .eq("id", project_id)
        .eq("owner_id", user["id"])
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"message": "Project deleted"}
