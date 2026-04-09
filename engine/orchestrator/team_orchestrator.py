"""
Team Orchestrator — full team execution engine with coordinator pattern.

The flagship feature of the framework:
1. Coordinator agent decomposes goal → task graph
2. Tasks are loaded into TaskQueue with dependency resolution
3. AgentPool executes tasks in parallel (respecting dependencies)
4. Results are persisted to shared memory
5. Coordinator synthesises final answer

Inspired by open-multi-agent's OpenMultiAgent class.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable, Awaitable, Optional

from agents.base.agent import BaseAgent
from agents.base.llm_provider import create_provider, LLMProvider, Message
from agents.tools.registry import ToolRegistry
from agents.tools.executor import ToolExecutor
from agents.tools.builtin import register_builtin_tools
from agents.teams.team import Team, AgentConfig, TeamConfig
from agents.teams.pool import AgentPool
from agents.coordinator import (
    build_coordinator_system_prompt,
    build_decomposition_prompt,
    build_synthesis_prompt,
    parse_task_specs,
    TaskSpec,
)
from engine.orchestrator.task_queue import TaskQueue, Task, TaskStatus, create_task
from engine.contracts.messages import PipelineEvent, EventType, AgentRole

logger = logging.getLogger(__name__)

# Type alias for progress callbacks
ProgressCallback = Callable[[dict[str, Any]], Awaitable[None] | None]


class _StandaloneAgent(BaseAgent):
    """Lightweight agent for team orchestration (no pipeline contracts needed)."""

    role = AgentRole.ORCHESTRATOR

    def __init__(
        self,
        llm_provider: LLMProvider,
        system_prompt: str = "",
        tool_registry: Optional[ToolRegistry] = None,
        tool_executor: Optional[ToolExecutor] = None,
    ):
        super().__init__(llm_provider, tool_registry, tool_executor)
        self._system_prompt = system_prompt

    def build_prompt(self, request):
        return [Message(role="system", content=self._system_prompt)]

    def parse_response(self, raw_content, request):
        return {"output": raw_content}


def _build_agent(
    config: AgentConfig,
    default_provider: str = "openai",
) -> BaseAgent:
    """Build a BaseAgent from AgentConfig with tools."""
    provider = create_provider(
        config.provider or default_provider,
        api_key=config.api_key,
        default_model=config.model,
        base_url=config.base_url,
    )

    # Set up tools
    registry = ToolRegistry()
    register_builtin_tools(registry)
    executor = ToolExecutor(registry)

    agent = _StandaloneAgent(
        llm_provider=provider,
        system_prompt=config.system_prompt,
        tool_registry=registry,
        tool_executor=executor,
    )
    agent._workspace_dir = ""  # Will be set by orchestrator
    return agent


async def _build_task_prompt(task: Task, team: Team) -> str:
    """Build the agent prompt for a specific task, injecting shared context."""
    lines = [f"# Task: {task.title}", "", task.description]

    # Inject shared memory summary
    memory = team.get_shared_memory()
    if memory:
        summary = await memory.get_summary()
        if summary:
            lines.extend(["", summary])

    # Inject messages from other agents
    if task.assignee:
        bus = team.get_message_bus()
        msg_text = bus.format_for_prompt(task.assignee)
        if msg_text:
            lines.extend(["", msg_text])

    return "\n".join(lines)


class TeamOrchestrator:
    """
    Central orchestrator for multi-agent team execution.

    Usage::

        orchestrator = TeamOrchestrator(default_provider="openai")

        team = orchestrator.create_team(TeamConfig(
            name="dev-team",
            agents=[
                AgentConfig(name="architect", model="gpt-4o", system_prompt="..."),
                AgentConfig(name="developer", model="gpt-4o", system_prompt="..."),
            ],
        ))

        result = await orchestrator.run_team(team, "Build a REST API for a blog")
    """

    def __init__(
        self,
        default_provider: str = "openai",
        default_model: str = "gpt-4o",
        max_concurrency: int = 5,
        on_progress: Optional[ProgressCallback] = None,
        workspace_dir: str = "",
    ):
        self.default_provider = default_provider
        self.default_model = default_model
        self.max_concurrency = max_concurrency
        self.on_progress = on_progress
        self.workspace_dir = workspace_dir or os.getcwd()
        self._teams: dict[str, Team] = {}
        self._completed_tasks = 0

    def create_team(self, config: TeamConfig) -> Team:
        """Create and register a team."""
        team = Team(config)
        self._teams[config.name] = team
        return team

    async def run_team(
        self,
        team: Team,
        goal: str,
        mode: str = "planning",
        plan_approval_callback: Optional[Callable] = None,
    ) -> dict[str, Any]:
        """
        Run a team on a high-level goal.

        Modes:
            - 'fast':     Skip coordinator, send goal directly to agents.
            - 'planning': Coordinator decomposes goal → show plan → execute.
        """
        if mode == "fast":
            return await self._run_fast(team, goal)
        else:
            return await self._run_planning(team, goal, plan_approval_callback)

    async def _run_fast(self, team: Team, goal: str) -> dict[str, Any]:
        """
        Fast mode — skip coordinator, send goal directly to all agents in parallel.
        Each agent works independently on the full goal.
        """
        agent_configs = team.get_agent_configs()
        await self._emit({"type": "message", "data": "🚀 Fast mode — skipping planning, executing directly"})

        pool = AgentPool(team.config.max_concurrency or self.max_concurrency)
        for ac in agent_configs:
            agent = _build_agent(ac, self.default_provider)
            agent._workspace_dir = self.workspace_dir
            pool.add(ac.name, agent)

        # Run all agents in parallel on the full goal
        agent_results: dict[str, dict[str, Any]] = {}
        tasks_coros = []
        for ac in agent_configs:
            await self._emit({"type": "agent_start", "agent": ac.name})
            tasks_coros.append(
                self._run_fast_agent(ac, pool, team, goal, agent_results)
            )

        await asyncio.gather(*tasks_coros)

        # Combine outputs
        outputs = []
        total_tokens = {"prompt_tokens": 0, "completion_tokens": 0}
        for ac in agent_configs:
            key = ac.name
            result = agent_results.get(key, {})
            if result.get("success"):
                outputs.append(f"## {ac.name}\n\n{result.get('output', '')}")
            tu = result.get("token_usage", {})
            total_tokens["prompt_tokens"] += tu.get("prompt_tokens", 0)
            total_tokens["completion_tokens"] += tu.get("completion_tokens", 0)

        return {
            "success": all(r.get("success") for r in agent_results.values()),
            "output": "\n\n---\n\n".join(outputs) if outputs else "No output produced",
            "tasks": [],
            "agent_results": agent_results,
            "total_token_usage": total_tokens,
            "team": team.name,
            "mode": "fast",
        }

    async def _run_fast_agent(
        self, ac: AgentConfig, pool: AgentPool, team: Team,
        goal: str, agent_results: dict,
    ) -> None:
        """Run a single agent in fast mode."""
        try:
            result = await pool.run(ac.name, goal, ac.system_prompt)
            agent_results[ac.name] = result

            if result.get("success"):
                memory = team.get_shared_memory()
                if memory:
                    await memory.write(ac.name, "output", result["output"])
                await self._emit({"type": "agent_complete", "agent": ac.name})
            else:
                await self._emit({"type": "error", "agent": ac.name})
        except Exception as exc:
            agent_results[ac.name] = {"success": False, "output": str(exc)}
            await self._emit({"type": "error", "agent": ac.name, "data": str(exc)})

    async def _run_planning(
        self,
        team: Team,
        goal: str,
        plan_approval_callback: Optional[Callable] = None,
    ) -> dict[str, Any]:
        """
        Planning mode — coordinator decomposes goal, optionally waits for
        user approval, then executes.
        """
        agent_configs = team.get_agent_configs()

        # Step 1: Coordinator decomposes goal
        await self._emit({"type": "agent_start", "agent": "coordinator", "data": {"phase": "decomposition"}})

        coordinator_provider = create_provider(
            self.default_provider,
            default_model=self.default_model,
        )
        roster_info = [
            {"name": a.name, "model": a.model, "system_prompt": a.system_prompt}
            for a in agent_configs
        ]
        coordinator_system = build_coordinator_system_prompt(roster_info)
        decomp_prompt = build_decomposition_prompt(goal, [a.name for a in agent_configs])

        # Call LLM for decomposition
        decomp_response = await coordinator_provider.generate(
            [
                Message(role="system", content=coordinator_system),
                Message(role="user", content=decomp_prompt),
            ],
            temperature=0.3,
            max_tokens=4096,
        )

        # Step 2: Parse tasks
        task_specs = parse_task_specs(decomp_response.content)
        queue = TaskQueue()
        agent_results: dict[str, dict[str, Any]] = {}

        if task_specs:
            self._load_specs_into_queue(task_specs, agent_configs, queue)
        else:
            # Fallback: one task per agent
            logger.warning("Coordinator failed to produce structured tasks, using fallback")
            for ac in agent_configs:
                task = create_task(
                    title=f"{ac.name}: {goal[:80]}",
                    description=goal,
                    assignee=ac.name,
                )
                queue.add(task)

        self._auto_assign(queue, agent_configs)

        await self._emit({
            "type": "plan_ready",
            "data": {
                "tasks": queue.to_dict(),
                "message": f"Decomposed into {len(queue)} tasks",
            },
        })

        # Step 2.5: Wait for approval if callback is provided
        if plan_approval_callback:
            approved = plan_approval_callback(queue.to_dict())
            if asyncio.iscoroutine(approved):
                approved = await approved
            if not approved:
                return {
                    "success": False,
                    "output": "Plan rejected by user.",
                    "tasks": queue.to_dict(),
                    "agent_results": {},
                    "total_token_usage": {
                        "prompt_tokens": decomp_response.prompt_tokens,
                        "completion_tokens": decomp_response.completion_tokens,
                    },
                    "team": team.name,
                    "mode": "planning",
                }

        await self._emit({"type": "message", "data": f"Decomposed into {len(queue)} tasks"})

        # Step 3: Build pool and execute
        pool = AgentPool(team.config.max_concurrency or self.max_concurrency)
        for ac in agent_configs:
            agent = _build_agent(ac, self.default_provider)
            agent._workspace_dir = self.workspace_dir
            pool.add(ac.name, agent)

        await self._execute_queue(queue, team, pool, agent_results)

        # Step 4: Synthesise final answer
        await self._emit({"type": "agent_start", "agent": "coordinator", "data": {"phase": "synthesis"}})

        completed = [
            {"title": t.title, "assignee": t.assignee, "result": t.result or ""}
            for t in queue.list() if t.status == TaskStatus.COMPLETED
        ]
        failed = [
            {"title": t.title, "result": t.result or ""}
            for t in queue.list() if t.status == TaskStatus.FAILED
        ]

        memory_summary = ""
        mem = team.get_shared_memory()
        if mem:
            memory_summary = await mem.get_summary()

        synthesis_prompt = build_synthesis_prompt(goal, completed, failed, memory_summary)
        synthesis_response = await coordinator_provider.generate(
            [
                Message(role="system", content=coordinator_system),
                Message(role="user", content=synthesis_prompt),
            ],
            temperature=0.4,
            max_tokens=8192,
        )

        await self._emit({"type": "agent_complete", "agent": "coordinator"})

        # Build final result
        total_tokens = {
            "prompt_tokens": decomp_response.prompt_tokens + synthesis_response.prompt_tokens,
            "completion_tokens": decomp_response.completion_tokens + synthesis_response.completion_tokens,
        }
        for ar in agent_results.values():
            tu = ar.get("token_usage", {})
            total_tokens["prompt_tokens"] += tu.get("prompt_tokens", 0)
            total_tokens["completion_tokens"] += tu.get("completion_tokens", 0)

        return {
            "success": self._queue_succeeded(queue),
            "output": synthesis_response.content,
            "tasks": queue.to_dict(),
            "agent_results": agent_results,
            "total_token_usage": total_tokens,
            "team": team.name,
            "mode": "planning",
        }

    async def run_tasks(
        self,
        team: Team,
        tasks: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Run a team with an explicit task list (no coordinator)."""
        agent_configs = team.get_agent_configs()
        queue = TaskQueue()

        specs = [
            TaskSpec(
                title=t["title"],
                description=t["description"],
                assignee=t.get("assignee"),
                depends_on=t.get("depends_on", []),
            )
            for t in tasks
        ]
        self._load_specs_into_queue(specs, agent_configs, queue)
        self._auto_assign(queue, agent_configs)

        pool = AgentPool(team.config.max_concurrency or self.max_concurrency)
        for ac in agent_configs:
            agent = _build_agent(ac, self.default_provider)
            agent._workspace_dir = self.workspace_dir
            pool.add(ac.name, agent)

        agent_results: dict[str, dict[str, Any]] = {}
        await self._execute_queue(queue, team, pool, agent_results)

        return {
            "success": self._queue_succeeded(queue),
            "tasks": queue.to_dict(),
            "agent_results": agent_results,
        }

    async def run_single_agent(
        self,
        config: AgentConfig,
        prompt: str,
    ) -> dict[str, Any]:
        """Run a single agent on a prompt (no team needed)."""
        agent = _build_agent(config, self.default_provider)
        agent._workspace_dir = self.workspace_dir
        result = await agent.run(prompt, config.system_prompt)
        if result.get("success"):
            self._completed_tasks += 1
        return result

    # ------------------------------------------------------------------
    # Internal execution
    # ------------------------------------------------------------------

    async def _execute_queue(
        self,
        queue: TaskQueue,
        team: Team,
        pool: AgentPool,
        agent_results: dict[str, dict[str, Any]],
    ) -> None:
        """Execute all tasks in the queue respecting dependencies."""
        while True:
            pending = queue.get_pending()
            if not pending:
                break

            # Dispatch all pending tasks in parallel
            dispatch = []
            for task in pending:
                dispatch.append(self._run_task(task, queue, team, pool, agent_results))

            await asyncio.gather(*dispatch)

    async def _run_task(
        self,
        task: Task,
        queue: TaskQueue,
        team: Team,
        pool: AgentPool,
        agent_results: dict[str, dict[str, Any]],
    ) -> None:
        """Execute a single task."""
        queue.start(task.id)

        assignee = task.assignee
        if not assignee:
            queue.fail(task.id, f"Task '{task.title}' has no assignee")
            await self._emit({"type": "error", "task": task.id, "data": "No assignee"})
            return

        if not pool.has(assignee):
            queue.fail(task.id, f"Agent '{assignee}' not found")
            await self._emit({"type": "error", "task": task.id, "data": f"Agent '{assignee}' not found"})
            return

        await self._emit({"type": "task_start", "task": task.id, "agent": assignee})

        prompt = await _build_task_prompt(task, team)

        try:
            agent_config = team.get_agent_config(assignee)
            system_prompt = agent_config.system_prompt if agent_config else ""
            result = await pool.run(assignee, prompt, system_prompt)
            agent_results[f"{assignee}:{task.id}"] = result

            if result.get("success"):
                # Persist to shared memory
                memory = team.get_shared_memory()
                if memory:
                    await memory.write(assignee, f"task:{task.id}:result", result["output"])

                queue.complete(task.id, result["output"])
                self._completed_tasks += 1
                await self._emit({"type": "task_complete", "task": task.id, "agent": assignee})
            else:
                queue.fail(task.id, result.get("output", "Unknown error"))
                await self._emit({"type": "error", "task": task.id, "agent": assignee})

        except Exception as exc:
            queue.fail(task.id, str(exc))
            await self._emit({"type": "error", "task": task.id, "data": str(exc)})

    def _load_specs_into_queue(
        self,
        specs: list[TaskSpec],
        agent_configs: list[AgentConfig],
        queue: TaskQueue,
    ) -> None:
        """Load task specs into queue, resolving title-based dependencies."""
        agent_names = {a.name for a in agent_configs}

        # First pass: create tasks to get IDs
        title_to_id: dict[str, str] = {}
        created_tasks: list[Task] = []

        for spec in specs:
            task = create_task(
                title=spec.title,
                description=spec.description,
                assignee=spec.assignee if spec.assignee in agent_names else None,
            )
            title_to_id[spec.title.lower().strip()] = task.id
            created_tasks.append(task)

        # Second pass: resolve dependencies and add to queue
        for i, task in enumerate(created_tasks):
            spec = specs[i]
            if spec.depends_on:
                resolved = []
                for dep_ref in spec.depends_on:
                    dep_id = title_to_id.get(dep_ref.lower().strip())
                    if dep_id:
                        resolved.append(dep_id)
                task.depends_on = resolved
                if resolved:
                    task.status = TaskStatus.BLOCKED

            queue.add(task)

    # Auto-assign unassigned tasks
    def _auto_assign(self, queue: TaskQueue, agent_configs: list[AgentConfig]) -> None:
        """Assign unassigned tasks to agents round-robin."""
        unassigned = [t for t in queue.list() if not t.assignee]
        if not unassigned or not agent_configs:
            return
        for i, task in enumerate(unassigned):
            agent = agent_configs[i % len(agent_configs)]
            task.assignee = agent.name

    def _queue_succeeded(self, queue: TaskQueue) -> bool:
        """A run is successful only if every task completed."""
        tasks = queue.list()
        return all(task.status == TaskStatus.COMPLETED for task in tasks)

    async def _emit(self, event: dict[str, Any]) -> None:
        """Emit a progress event."""
        if self.on_progress:
            try:
                result = self.on_progress(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:
                logger.warning("Progress callback failed: %s", exc)

    def get_status(self) -> dict[str, Any]:
        return {
            "teams": len(self._teams),
            "completed_tasks": self._completed_tasks,
        }
