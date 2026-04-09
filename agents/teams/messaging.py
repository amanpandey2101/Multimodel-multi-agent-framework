"""
Message Bus — inter-agent communication within a team.

Inspired by open-multi-agent's messaging.ts.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class AgentMessage:
    """A message sent between agents."""
    from_agent: str
    to_agent: str     # "" = broadcast
    content: str
    message_type: str = "text"  # text | task_result | request | notification
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


class MessageBus:
    """
    Simple message bus for inter-agent communication.

    Usage::

        bus = MessageBus()
        bus.send("architect", "developer", "Here's the API spec: ...")
        bus.broadcast("coordinator", "All tasks assigned, begin execution.")

        messages = bus.get_messages("developer")
        all_msgs = bus.get_all_messages()
    """

    def __init__(self) -> None:
        self._messages: list[AgentMessage] = []

    def send(
        self,
        from_agent: str,
        to_agent: str,
        content: str,
        message_type: str = "text",
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Send a message from one agent to another."""
        msg = AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            content=content,
            message_type=message_type,
            metadata=metadata or {},
        )
        self._messages.append(msg)
        logger.debug("MessageBus: %s → %s (%d chars)", from_agent, to_agent, len(content))

    def broadcast(
        self,
        from_agent: str,
        content: str,
        message_type: str = "notification",
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Broadcast a message to all agents."""
        self.send(from_agent, "", content, message_type, metadata)

    def get_messages(self, agent_name: str) -> list[AgentMessage]:
        """Get all messages addressed to a specific agent (or broadcast)."""
        return [
            m for m in self._messages
            if m.to_agent == agent_name or m.to_agent == ""
        ]

    def get_messages_from(self, from_agent: str) -> list[AgentMessage]:
        """Get all messages sent by a specific agent."""
        return [m for m in self._messages if m.from_agent == from_agent]

    def get_all_messages(self) -> list[AgentMessage]:
        """Get all messages."""
        return list(self._messages)

    def clear(self) -> None:
        self._messages.clear()

    def format_for_prompt(self, agent_name: str) -> str:
        """Format messages for inclusion in an agent's prompt."""
        messages = self.get_messages(agent_name)
        if not messages:
            return ""

        lines = ["## Messages from team members", ""]
        for msg in messages:
            prefix = f"**{msg.from_agent}**"
            if msg.to_agent == "":
                prefix += " (broadcast)"
            lines.append(f"- {prefix}: {msg.content}")

        return "\n".join(lines)

    def __len__(self) -> int:
        return len(self._messages)
