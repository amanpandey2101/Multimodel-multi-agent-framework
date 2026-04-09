"""
Unit tests for the team system: SharedMemory, MessageBus, Team, AgentPool.
And task queue / team orchestrator infrastructure.
"""

from __future__ import annotations

import asyncio
import pytest

from agents.teams.memory import SharedMemory
from agents.teams.messaging import MessageBus
from agents.teams.team import Team, TeamConfig, AgentConfig
from agents.teams.pool import AgentPool
from engine.orchestrator.task_queue import TaskQueue, Task, TaskStatus, create_task
from engine.tracker.cost_tracker import CostTracker
from agents.coordinator import parse_task_specs


# ---------------------------------------------------------------------------
# SharedMemory Tests
# ---------------------------------------------------------------------------

class TestSharedMemory:
    @pytest.mark.asyncio
    async def test_write_and_read(self):
        mem = SharedMemory()
        await mem.write("researcher", "findings", "TypeScript is great")
        entry = await mem.read("researcher/findings")
        assert entry is not None
        assert entry.value == "TypeScript is great"
        assert entry.agent == "researcher"

    @pytest.mark.asyncio
    async def test_namespace_isolation(self):
        mem = SharedMemory()
        await mem.write("agent_a", "data", "value_a")
        await mem.write("agent_b", "data", "value_b")

        a = await mem.read("agent_a/data")
        b = await mem.read("agent_b/data")
        assert a.value == "value_a"
        assert b.value == "value_b"

    @pytest.mark.asyncio
    async def test_list_by_agent(self):
        mem = SharedMemory()
        await mem.write("alice", "fact1", "data1")
        await mem.write("alice", "fact2", "data2")
        await mem.write("bob", "fact1", "data3")

        alice_entries = await mem.list_by_agent("alice")
        assert len(alice_entries) == 2

    @pytest.mark.asyncio
    async def test_get_summary(self):
        mem = SharedMemory()
        await mem.write("researcher", "findings", "Important discovery")
        summary = await mem.get_summary()
        assert "## Shared Team Memory" in summary
        assert "researcher" in summary
        assert "Important discovery" in summary

    @pytest.mark.asyncio
    async def test_empty_summary(self):
        mem = SharedMemory()
        summary = await mem.get_summary()
        assert summary == ""


# ---------------------------------------------------------------------------
# MessageBus Tests
# ---------------------------------------------------------------------------

class TestMessageBus:
    def test_send_and_get(self):
        bus = MessageBus()
        bus.send("architect", "developer", "Here's the API spec")
        msgs = bus.get_messages("developer")
        assert len(msgs) == 1
        assert msgs[0].from_agent == "architect"
        assert "API spec" in msgs[0].content

    def test_broadcast(self):
        bus = MessageBus()
        bus.broadcast("coordinator", "All tasks assigned")
        # Broadcast should be visible to any agent
        msgs_dev = bus.get_messages("developer")
        msgs_rev = bus.get_messages("reviewer")
        assert len(msgs_dev) == 1
        assert len(msgs_rev) == 1

    def test_format_for_prompt(self):
        bus = MessageBus()
        bus.send("architect", "developer", "Use REST API")
        formatted = bus.format_for_prompt("developer")
        assert "## Messages from team members" in formatted
        assert "architect" in formatted


# ---------------------------------------------------------------------------
# Team Tests
# ---------------------------------------------------------------------------

class TestTeam:
    def test_create_team(self):
        config = TeamConfig(
            name="test-team",
            agents=[
                AgentConfig(name="a1", model="gpt-4o"),
                AgentConfig(name="a2", model="gpt-4o"),
            ],
        )
        team = Team(config)
        assert team.name == "test-team"
        assert len(team.get_agent_configs()) == 2
        assert team.get_shared_memory() is not None
        assert team.get_message_bus() is not None

    def test_get_agent_config(self):
        config = TeamConfig(
            name="t",
            agents=[AgentConfig(name="dev", model="gpt-4o", system_prompt="You are a dev")],
        )
        team = Team(config)
        ac = team.get_agent_config("dev")
        assert ac is not None
        assert ac.system_prompt == "You are a dev"

    def test_no_shared_memory(self):
        config = TeamConfig(name="t", agents=[], shared_memory=False)
        team = Team(config)
        assert team.get_shared_memory() is None


# ---------------------------------------------------------------------------
# TaskQueue Tests
# ---------------------------------------------------------------------------

class TestTaskQueue:
    def test_add_and_get_pending(self):
        queue = TaskQueue()
        t1 = create_task(title="Task 1", description="Do thing 1")
        queue.add(t1)
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0].title == "Task 1"

    def test_dependency_blocking(self):
        queue = TaskQueue()
        t1 = create_task(title="First", description="First task")
        t2 = create_task(title="Second", description="Depends on first", depends_on=[t1.id])
        queue.add(t1)
        queue.add(t2)

        # Only t1 should be pending
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0].id == t1.id

    def test_complete_unblocks_dependents(self):
        queue = TaskQueue()
        t1 = create_task(title="First", description="")
        t2 = create_task(title="Second", description="", depends_on=[t1.id])
        queue.add(t1)
        queue.add(t2)

        queue.complete(t1.id, "done")
        pending = queue.get_pending()
        assert len(pending) == 1
        assert pending[0].id == t2.id

    def test_fail_cascades(self):
        queue = TaskQueue()
        t1 = create_task(title="Parent", description="")
        t2 = create_task(title="Child", description="", depends_on=[t1.id])
        queue.add(t1)
        queue.add(t2)

        queue.fail(t1.id, "error")
        assert queue.get(t2.id).status == TaskStatus.BLOCKED

    def test_is_complete(self):
        queue = TaskQueue()
        t = create_task(title="Only", description="")
        queue.add(t)
        assert not queue.is_complete()
        queue.complete(t.id, "done")
        assert queue.is_complete()


# ---------------------------------------------------------------------------
# CostTracker Tests
# ---------------------------------------------------------------------------

class TestCostTracker:
    def test_record_and_total(self):
        tracker = CostTracker()
        tracker.record("engineer", "impl", "gpt-4o", "openai", 1000, 2000)
        assert tracker.total_tokens == 3000
        assert tracker.total_cost_usd > 0

    def test_by_agent(self):
        tracker = CostTracker()
        tracker.record("a", "s1", "gpt-4o", "openai", 100, 200)
        tracker.record("b", "s1", "gpt-4o", "openai", 300, 400)
        by_agent = tracker.by_agent()
        assert "a" in by_agent
        assert "b" in by_agent
        assert by_agent["a"]["total_tokens"] == 300
        assert by_agent["b"]["total_tokens"] == 700

    def test_free_model(self):
        tracker = CostTracker()
        tracker.record("x", "s", "llama3", "ollama", 10000, 20000)
        assert tracker.total_cost_usd == 0.0


# ---------------------------------------------------------------------------
# Coordinator Parser Tests
# ---------------------------------------------------------------------------

class TestCoordinatorParser:
    def test_parse_fenced_json(self):
        raw = '''Here's the plan:

```json
[
    {"title": "Design API", "description": "Design the REST API", "assignee": "architect", "dependsOn": []},
    {"title": "Implement", "description": "Write the code", "assignee": "developer", "dependsOn": ["Design API"]}
]
```
'''
        specs = parse_task_specs(raw)
        assert len(specs) == 2
        assert specs[0].title == "Design API"
        assert specs[1].assignee == "developer"
        assert specs[1].depends_on == ["Design API"]

    def test_parse_bare_json(self):
        raw = '[{"title": "Task 1", "description": "Do it"}]'
        specs = parse_task_specs(raw)
        assert len(specs) == 1

    def test_parse_invalid(self):
        raw = "This is not JSON at all"
        specs = parse_task_specs(raw)
        assert len(specs) == 0
