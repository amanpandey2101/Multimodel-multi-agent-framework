"""
FastAPI SaaS Backend — main application entry point.

Uses Supabase for auth, database, and realtime.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import get_settings
from backend.app.auth.router import router as auth_router
from backend.app.projects.router import router as projects_router
from backend.app.pipelines.router import router as pipelines_router
from backend.app.artifacts.router import router as artifacts_router
from backend.app.github.router import router as github_router
from backend.app.websocket.router import router as ws_router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Multi-Agent SaaS Platform",
        description="Autonomous software engineering pipeline with Supabase backend",
        version="0.3.0",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
    app.include_router(pipelines_router, prefix="/api/pipelines", tags=["pipelines"])
    app.include_router(artifacts_router, prefix="/api/artifacts", tags=["artifacts"])
    app.include_router(github_router, prefix="/api/github", tags=["github"])
    app.include_router(ws_router, tags=["websocket"])

    @app.get("/api/health")
    async def health():
        return {"status": "healthy", "version": "0.3.0", "backend": "supabase"}

    return app


app = create_app()
