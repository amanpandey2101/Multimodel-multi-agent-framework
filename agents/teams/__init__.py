"""
Team system for multi-agent collaboration.

Provides:
    - Team: manages agent roster, shared memory, and message bus
    - SharedMemory: namespaced key-value store for inter-agent context
    - MessageBus: agent-to-agent communication
    - AgentPool: concurrency-controlled agent execution
"""

from agents.teams.team import Team, TeamConfig
from agents.teams.memory import SharedMemory
from agents.teams.messaging import MessageBus
from agents.teams.pool import AgentPool

__all__ = [
    "Team",
    "TeamConfig",
    "SharedMemory",
    "MessageBus",
    "AgentPool",
]
