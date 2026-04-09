"""
Artifacts API router: read-only access using Supabase client.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from backend.app.auth.dependencies import get_current_user
from backend.app.supabase_client import get_supabase_dependency

router = APIRouter()


def _assert_pipeline_access(pipeline_id: str, user_id: str, supabase: Client) -> dict:
    """Ensure the pipeline exists and belongs to the current user."""
    pipe = (
        supabase.table("pipelines")
        .select("id, project_id")
        .eq("id", pipeline_id)
        .maybe_single()
        .execute()
    )
    if not pipe.data:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    project = (
        supabase.table("projects")
        .select("id")
        .eq("id", pipe.data["project_id"])
        .eq("owner_id", user_id)
        .maybe_single()
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=403, detail="Access denied")

    return pipe.data


@router.get("/pipeline/{pipeline_id}")
async def list_artifacts(
    pipeline_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Get all artifacts for a pipeline."""
    _assert_pipeline_access(pipeline_id, user["id"], supabase)

    result = (
        supabase.table("artifacts")
        .select("*")
        .eq("pipeline_id", pipeline_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.get("/{artifact_id}")
async def get_artifact(
    artifact_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Get a specific artifact by ID."""
    result = (
        supabase.table("artifacts")
        .select("*, pipelines!inner(project_id, projects!inner(owner_id))")
        .eq("id", artifact_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Artifact not found")

    pipeline_data = result.data.get("pipelines", {})
    project_data = pipeline_data.get("projects", {})
    if project_data.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    artifact = {k: v for k, v in result.data.items() if k != "pipelines"}
    return artifact


@router.get("/pipeline/{pipeline_id}/stage/{stage_name}")
async def get_stage_artifacts(
    pipeline_id: str,
    stage_name: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Get all artifact versions for a specific stage."""
    _assert_pipeline_access(pipeline_id, user["id"], supabase)

    result = (
        supabase.table("artifacts")
        .select("*")
        .eq("pipeline_id", pipeline_id)
        .eq("stage_name", stage_name)
        .order("version")
        .execute()
    )
    return result.data
