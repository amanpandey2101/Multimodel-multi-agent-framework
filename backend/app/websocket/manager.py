"""
WebSocket Connection Manager — tracks connected clients and broadcasts events.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections per pipeline/team session.

    Usage::

        manager = ConnectionManager()
        await manager.connect(websocket, pipeline_id)
        await manager.broadcast(pipeline_id, {"type": "stage_started", ...})
        manager.disconnect(websocket, pipeline_id)
    """

    def __init__(self) -> None:
        # pipeline_id → set of active connections
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        """Accept a WebSocket and track it under the session."""
        await websocket.accept()
        if session_id not in self._connections:
            self._connections[session_id] = set()
        self._connections[session_id].add(websocket)
        logger.info("WS connected: session=%s (total=%d)", session_id, len(self._connections[session_id]))

    def disconnect(self, websocket: WebSocket, session_id: str) -> None:
        """Remove a WebSocket from the session."""
        conns = self._connections.get(session_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self._connections[session_id]
        logger.info("WS disconnected: session=%s", session_id)

    async def broadcast(self, session_id: str, data: dict[str, Any]) -> None:
        """Send a JSON message to all connections in a session."""
        conns = self._connections.get(session_id)
        if not conns:
            return

        message = json.dumps(data, default=str)
        dead: list[WebSocket] = []

        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        for ws in dead:
            conns.discard(ws)

    async def send_personal(self, websocket: WebSocket, data: dict[str, Any]) -> None:
        """Send a message to a specific WebSocket."""
        try:
            await websocket.send_text(json.dumps(data, default=str))
        except Exception:
            pass

    def get_connection_count(self, session_id: Optional[str] = None) -> int:
        if session_id:
            return len(self._connections.get(session_id, set()))
        return sum(len(c) for c in self._connections.values())


# Singleton instance
ws_manager = ConnectionManager()
