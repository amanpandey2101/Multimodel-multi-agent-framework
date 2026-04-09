"""
Team — manages an agent roster, shared memory, and message bus.

Inspired by open-multi-agent's Team class.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from agents.teams.memory import SharedMemory
from agents.teams.messaging import MessageBus

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    """Configuration for a single agent within a team."""
    name: str
    model: str = "gpt-4o"
    provider: str = "openai"
    system_prompt: str = ""
    tools: list[str] = field(default_factory=list)
    max_turns: int = 15
    max_tokens: int = 4096
    temperature: float = 0.4
    base_url: Optional[str] = None
    api_key: Optional[str] = None


@dataclass
class TeamConfig:
    """Configuration for a team of cooperating agents."""
    name: str
    agents: list[AgentConfig] = field(default_factory=list)
    shared_memory: bool = True
    max_concurrency: int = 5


class Team:
    """
    A team of cooperating agents with shared memory and messaging.

    Usage::

        config = TeamConfig(
            name="dev-team",
            agents=[
                AgentConfig(name="architect", model="gpt-4o", ...),
                AgentConfig(name="developer", model="gpt-4o", ...),
            ],
            shared_memory=True,
        )
        team = Team(config)

        agents = team.get_agent_configs()
        memory = team.get_shared_memory()
        bus = team.get_message_bus()
    """

    def __init__(self, config: TeamConfig):
        self.config = config
        self._memory = SharedMemory() if config.shared_memory else None
        self._bus = MessageBus()
        logger.info(
            "Team '%s' created with %d agents (shared_memory=%s)",
            config.name, len(config.agents), config.shared_memory,
        )

    @property
    def name(self) -> str:
        return self.config.name

    def get_agent_configs(self) -> list[AgentConfig]:
        """Return the team's agent configurations."""
        return list(self.config.agents)

    def get_agent_config(self, name: str) -> Optional[AgentConfig]:
        """Get a specific agent's config by name."""
        for ac in self.config.agents:
            if ac.name == name:
                return ac
        return None

    def get_agent_names(self) -> list[str]:
        return [a.name for a in self.config.agents]

    def get_shared_memory(self) -> Optional[SharedMemory]:
        return self._memory

    def get_message_bus(self) -> MessageBus:
        return self._bus

    def get_messages(self, agent_name: str):
        """Get messages addressed to a specific agent."""
        return self._bus.get_messages(agent_name)

    def to_dict(self) -> dict[str, Any]:
        """Serialise team state."""
        return {
            "name": self.config.name,
            "agents": [
                {
                    "name": a.name,
                    "model": a.model,
                    "provider": a.provider,
                    "system_prompt": a.system_prompt[:100],
                    "tools": a.tools,
                }
                for a in self.config.agents
            ],
            "shared_memory": self._memory.to_dict() if self._memory else {},
            "message_count": len(self._bus),
        }
