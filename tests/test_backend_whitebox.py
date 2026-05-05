"""
White-box tests for backend internals used in Chapter 5.
"""

from __future__ import annotations

import pytest

from backend.app.config import Settings, get_settings
from backend.app.websocket.manager import ConnectionManager


class DummyWebSocket:
    def __init__(self, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.accepted = False
        self.messages: list[str] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, message: str) -> None:
        if self.should_fail:
            raise RuntimeError("socket closed")
        self.messages.append(message)


def test_settings_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEFAULT_LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("MAX_CRITIC_ITERATIONS", "7")
    monkeypatch.setenv("DEBUG", "true")
    settings = Settings()

    assert settings.default_llm_provider == "anthropic"
    assert settings.max_critic_iterations == 7


def test_get_settings_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEBUG", "true")
    get_settings.cache_clear()
    first = get_settings()
    second = get_settings()
    assert first is second
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_connection_manager_broadcast_removes_dead_connections() -> None:
    manager = ConnectionManager()
    alive = DummyWebSocket()
    dead = DummyWebSocket(should_fail=True)

    await manager.connect(alive, "p1")
    await manager.connect(dead, "p1")
    assert alive.accepted is True
    assert manager.get_connection_count("p1") == 2

    await manager.broadcast("p1", {"type": "stage_started"})

    assert manager.get_connection_count("p1") == 1
    assert len(alive.messages) == 1
