"""
Shared Memory — namespaced key-value store for inter-agent context.

Each agent writes under its own namespace (``<agent>/<key>``) so entries
are always attributable. Any agent may read any key. The ``get_summary()``
method produces a markdown digest suitable for context-window injection.

Inspired by open-multi-agent's SharedMemory.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class MemoryEntry:
    """A single record in shared memory."""
    key: str
    value: str
    agent: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()


class SharedMemory:
    """
    Namespaced shared memory for a team of agents.

    Writes are namespaced as ``<agent_name>/<key>`` so entries from
    different agents never collide.

    Usage::

        mem = SharedMemory()
        await mem.write("researcher", "findings", "TypeScript 5.5 adds ...")
        await mem.write("coder", "plan", "Implement using const type params")

        entry = await mem.read("researcher/findings")
        summary = await mem.get_summary()
    """

    def __init__(self) -> None:
        self._store: dict[str, MemoryEntry] = {}

    async def write(
        self,
        agent_name: str,
        key: str,
        value: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Write a value under the agent's namespace."""
        namespaced = f"{agent_name}/{key}"
        self._store[namespaced] = MemoryEntry(
            key=namespaced,
            value=value,
            agent=agent_name,
            metadata=metadata or {},
        )
        logger.debug("SharedMemory: %s wrote %s (%d chars)", agent_name, key, len(value))

    async def read(self, key: str) -> Optional[MemoryEntry]:
        """Read an entry by its fully-qualified key."""
        return self._store.get(key)

    async def list_all(self) -> list[MemoryEntry]:
        """Return all entries."""
        return list(self._store.values())

    async def list_by_agent(self, agent_name: str) -> list[MemoryEntry]:
        """Return all entries written by a specific agent."""
        prefix = f"{agent_name}/"
        return [e for e in self._store.values() if e.key.startswith(prefix)]

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def clear(self) -> None:
        self._store.clear()

    async def get_summary(self) -> str:
        """
        Produce a markdown summary grouped by agent.

        Suitable for injecting into agent prompts as context.
        """
        if not self._store:
            return ""

        by_agent: dict[str, list[tuple[str, str]]] = {}
        for entry in self._store.values():
            agent = entry.agent or "_unknown"
            local_key = entry.key.split("/", 1)[-1] if "/" in entry.key else entry.key
            by_agent.setdefault(agent, []).append((local_key, entry.value))

        lines = ["## Shared Team Memory", ""]
        for agent, entries in by_agent.items():
            lines.append(f"### {agent}")
            for local_key, value in entries:
                display = value[:300] + "…" if len(value) > 300 else value
                # Replace newlines for inline display
                display = display.replace("\n", " ")
                lines.append(f"- **{local_key}**: {display}")
            lines.append("")

        return "\n".join(lines).rstrip()

    def to_dict(self) -> dict[str, Any]:
        """Serialise for persistence."""
        return {
            k: {
                "key": e.key,
                "value": e.value,
                "agent": e.agent,
                "metadata": e.metadata,
                "created_at": e.created_at,
            }
            for k, e in self._store.items()
        }

    def __len__(self) -> int:
        return len(self._store)
