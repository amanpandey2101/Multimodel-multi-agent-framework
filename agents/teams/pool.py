"""
Agent Pool — concurrency-controlled agent execution.

Inspired by open-multi-agent's AgentPool with Semaphore.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class AgentPool:
    """
    Pool of agents with concurrency-limited parallel execution.

    Usage::

        pool = AgentPool(max_concurrency=3)
        pool.add("architect", architect_agent)
        pool.add("developer", developer_agent)

        result = await pool.run("architect", "Design the API")
    """

    def __init__(self, max_concurrency: int = 5):
        self.max_concurrency = max_concurrency
        self._agents: dict[str, Any] = {}  # name → BaseAgent
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._running: set[str] = set()

    def add(self, name: str, agent: Any) -> None:
        """Add an agent to the pool."""
        self._agents[name] = agent

    def get(self, name: str) -> Optional[Any]:
        """Get an agent by name."""
        return self._agents.get(name)

    def has(self, name: str) -> bool:
        return name in self._agents

    def list_agents(self) -> list[str]:
        return list(self._agents.keys())

    async def run(
        self,
        agent_name: str,
        prompt: str,
        system_prompt: str = "",
    ) -> dict[str, Any]:
        """
        Run an agent with concurrency control.

        Acquires the semaphore, executes the agent, and releases.
        Returns the agent's result dict.
        """
        agent = self._agents.get(agent_name)
        if agent is None:
            return {
                "success": False,
                "output": f"Agent '{agent_name}' not found in pool",
                "token_usage": {},
                "tool_calls": [],
            }

        async with self._semaphore:
            self._running.add(agent_name)
            logger.info("AgentPool: running '%s' (active: %d)", agent_name, len(self._running))
            try:
                result = await agent.run(prompt, system_prompt)
                return result
            except Exception as exc:
                logger.error("AgentPool: '%s' failed: %s", agent_name, exc)
                return {
                    "success": False,
                    "output": str(exc),
                    "token_usage": {},
                    "tool_calls": [],
                }
            finally:
                self._running.discard(agent_name)

    @property
    def active_count(self) -> int:
        return len(self._running)

    def __len__(self) -> int:
        return len(self._agents)
