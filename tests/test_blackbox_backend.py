"""
Black-box API tests for backend HTTP routes.
"""

from __future__ import annotations

import sys
import types
import os

from fastapi.testclient import TestClient

# Test-only stub so backend app can import without external supabase package.
if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")

    class Client:  # noqa: D101
        pass

    def create_client(*args, **kwargs):  # noqa: D401
        return object()

    supabase_stub.Client = Client
    supabase_stub.create_client = create_client
    sys.modules["supabase"] = supabase_stub

os.environ["DEBUG"] = "true"

from backend.app.main import create_app


client = TestClient(create_app())


def test_health_endpoint_returns_status_payload() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert "version" in body
    assert body["backend"] == "supabase"


def test_unknown_route_returns_404() -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404


def test_create_pipeline_without_auth_header_is_rejected() -> None:
    response = client.post(
        "/api/pipelines/",
        json={"project_id": "proj-1", "requirement": "Build demo app"},
    )
    assert response.status_code == 422
