"""
WebSocket Router — real-time pipeline and team event streaming.

Clients connect to /ws/{session_id} and receive structured events
as pipeline stages execute, agents produce output, tools are invoked, etc.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time pipeline/team events.

    Clients connect with a session_id (pipeline or team run ID) and
    receive structured JSON events as the execution progresses.
    """
    await ws_manager.connect(websocket, session_id)

    try:
        # Send initial connection confirmation
        await ws_manager.send_personal(websocket, {
            "type": "connected",
            "session_id": session_id,
            "message": "Connected to real-time event stream",
        })

        # Keep connection alive and listen for client messages
        while True:
            data = await websocket.receive_text()
            # Client can send control messages (e.g., ping, subscribe to specific events)
            if data == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, session_id)
    except Exception as exc:
        logger.warning("WebSocket error for session %s: %s", session_id, exc)
        ws_manager.disconnect(websocket, session_id)
