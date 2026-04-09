"""
Pipelines API router — CRUD and execution using Supabase client.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.app.supabase_client import get_supabase_dependency
from backend.app.auth.dependencies import get_current_user
from backend.app.pipelines.service import run_pipeline_task
from supabase import Client

router = APIRouter()


class PipelineCreate(BaseModel):
    project_id: str
    requirement: str
    llm_provider: str = "openai"
    llm_model: str = ""
    enable_critic: bool = True
    max_iterations: int = 3
    mode: str = "planning"


@router.post("/")
async def create_pipeline(
    body: PipelineCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Create and start a new pipeline."""
    # Verify project ownership
    project = (
        supabase.table("projects")
        .select("id")
        .eq("id", body.project_id)
        .eq("owner_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create pipeline record
    pipeline = (
        supabase.table("pipelines")
        .insert({
            "project_id": body.project_id,
            "requirement": body.requirement,
            "llm_provider": body.llm_provider,
            "llm_model": body.llm_model,
            "config": {
                "enable_critic": body.enable_critic,
                "max_iterations": body.max_iterations,
                "mode": body.mode,
            },
            "status": "pending",
        })
        .execute()
    )

    pipe_data = pipeline.data[0]

    # Create initial stages
    stages = [
        "requirements", "architecture", "task_breakdown",
        "implementation", "review", "deployment",
    ]
    stage_records = [
        {
            "pipeline_id": pipe_data["id"],
            "stage_name": name,
            "status": "pending",
            "agent_role": name,
        }
        for name in stages
    ]
    supabase.table("pipeline_stages").insert(stage_records).execute()

    # Launch in background
    background_tasks.add_task(run_pipeline_task, pipe_data["id"])

    # Return full pipeline with stages
    return await get_pipeline(pipe_data["id"], user, supabase)


@router.get("/project/{project_id}")
async def list_pipelines(
    project_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """List all pipelines for a project."""
    # Verify ownership
    project = (
        supabase.table("projects")
        .select("id")
        .eq("id", project_id)
        .eq("owner_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    result = (
        supabase.table("pipelines")
        .select("id, project_id, status, requirement, llm_provider, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{pipeline_id}")
async def get_pipeline(
    pipeline_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Get pipeline with its stages."""
    result = (
        supabase.table("pipelines")
        .select("*, pipeline_stages(*)")
        .eq("id", pipeline_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    pipe = result.data

    # Verify ownership through project
    project = (
        supabase.table("projects")
        .select("id")
        .eq("id", pipe["project_id"])
        .eq("owner_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=403, detail="Access denied")

    # Normalize response
    pipe["stages"] = pipe.pop("pipeline_stages", [])
    return pipe


@router.post("/{pipeline_id}/cancel")
async def cancel_pipeline(
    pipeline_id: str,
    user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_dependency),
):
    """Cancel a running pipeline."""
    # Get pipeline
    pipe = (
        supabase.table("pipelines")
        .select("id, project_id, status")
        .eq("id", pipeline_id)
        .maybe_single()
        .execute()
    )
    if not pipe.data:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Verify ownership
    project = (
        supabase.table("projects")
        .select("id")
        .eq("id", pipe.data["project_id"])
        .eq("owner_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=403, detail="Access denied")

    if pipe.data["status"] not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="Pipeline cannot be cancelled")

    supabase.table("pipelines").update({"status": "cancelled"}).eq("id", pipeline_id).execute()

    # Emit cancel event
    supabase.table("pipeline_events").insert({
        "pipeline_id": pipeline_id,
        "event_type": "pipeline_cancelled",
        "message": "Pipeline cancelled by user",
    }).execute()

    return {"message": "Pipeline cancelled"}
