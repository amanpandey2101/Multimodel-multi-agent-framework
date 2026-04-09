"""
Unit tests for the engine layer: DAG scheduler, State manager, Contracts, Critic loop.
"""

from __future__ import annotations

import asyncio
import json
import pytest
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# DAG Scheduler Tests
# ---------------------------------------------------------------------------

from engine.orchestrator.dag import DAGScheduler, DAGNode, NodeStatus


class TestDAGScheduler:
    """Tests for DAGScheduler topological sort, readiness, and lifecycle."""

    def _build_default_dag(self) -> DAGScheduler:
        dag = DAGScheduler()
        dag.add_node("requirements", "Requirements", "requirements_analyst")
        dag.add_node("architecture", "Architecture", "architect", deps=["requirements"])
        dag.add_node("tasks", "Tasks", "task_planner", deps=["requirements", "architecture"])
        dag.add_node("implementation", "Impl", "engineer", deps=["tasks"])
        dag.add_node("review", "Review", "reviewer", deps=["implementation"])
        dag.add_node("deployment", "Deploy", "devops", deps=["implementation"])
        return dag

    def test_topological_sort_order(self):
        dag = self._build_default_dag()
        order = dag.topological_sort()
        # requirements must come before architecture
        assert order.index("requirements") < order.index("architecture")
        # architecture must come before tasks
        assert order.index("architecture") < order.index("tasks")
        # tasks must come before implementation
        assert order.index("tasks") < order.index("implementation")
        # implementation must come before review and deployment
        assert order.index("implementation") < order.index("review")
        assert order.index("implementation") < order.index("deployment")

    def test_topological_sort_all_nodes(self):
        dag = self._build_default_dag()
        order = dag.topological_sort()
        assert len(order) == 6

    def test_cycle_detection(self):
        dag = DAGScheduler()
        dag.add_node("a", "A", "role_a", deps=["c"])
        dag.add_node("b", "B", "role_b", deps=["a"])
        dag.add_node("c", "C", "role_c", deps=["b"])
        with pytest.raises(ValueError, match="Cycle"):
            dag.topological_sort()

    def test_unknown_dependency(self):
        dag = DAGScheduler()
        dag.add_node("a", "A", "role_a", deps=["nonexistent"])
        with pytest.raises(ValueError, match="unknown node"):
            dag.topological_sort()

    def test_duplicate_node_raises(self):
        dag = DAGScheduler()
        dag.add_node("a", "A", "role_a")
        with pytest.raises(ValueError, match="Duplicate"):
            dag.add_node("a", "A2", "role_a2")

    def test_get_ready_nodes_initial(self):
        dag = self._build_default_dag()
        ready = dag.get_ready_nodes()
        assert len(ready) == 1
        assert ready[0].id == "requirements"

    def test_get_ready_nodes_after_completion(self):
        dag = self._build_default_dag()
        dag.mark_running("requirements")
        dag.mark_completed("requirements")
        ready = dag.get_ready_nodes()
        assert len(ready) == 1
        assert ready[0].id == "architecture"

    def test_parallel_readiness(self):
        dag = self._build_default_dag()
        # Complete through to implementation
        for nid in ["requirements", "architecture", "tasks", "implementation"]:
            dag.mark_running(nid)
            dag.mark_completed(nid)
        ready = dag.get_ready_nodes()
        ready_ids = {n.id for n in ready}
        # review and deployment should both be ready (parallel)
        assert ready_ids == {"review", "deployment"}

    def test_is_complete(self):
        dag = self._build_default_dag()
        assert not dag.is_complete()
        for nid in ["requirements", "architecture", "tasks", "implementation", "review", "deployment"]:
            dag.mark_running(nid)
            dag.mark_completed(nid)
        assert dag.is_complete()

    def test_has_failures(self):
        dag = self._build_default_dag()
        assert not dag.has_failures()
        dag.mark_running("requirements")
        dag.mark_failed("requirements", "test error")
        assert dag.has_failures()

    def test_serialisation_roundtrip(self):
        dag = self._build_default_dag()
        dag.mark_running("requirements")
        dag.mark_completed("requirements", {"key": "value"})
        data = dag.to_dict()
        restored = DAGScheduler.from_dict(data)
        assert restored.get_node("requirements").status == NodeStatus.COMPLETED

    def test_reset_node(self):
        dag = self._build_default_dag()
        dag.mark_running("requirements")
        dag.mark_completed("requirements")
        dag.reset_node("requirements")
        assert dag.get_node("requirements").status == NodeStatus.PENDING
        assert dag.get_node("requirements").iteration == 1


# ---------------------------------------------------------------------------
# State Manager Tests
# ---------------------------------------------------------------------------

from engine.orchestrator.state import StateManager, PipelineState


class TestStateManager:
    """Tests for StateManager lifecycle and serialisation."""

    def test_create_pipeline(self):
        mgr = StateManager()
        state = mgr.create_pipeline("p1", project_id="proj1")
        assert state.pipeline_id == "p1"
        assert state.status == "pending"

    def test_stage_lifecycle(self):
        mgr = StateManager()
        mgr.create_pipeline("p1")
        mgr.start_stage("p1", "requirements")
        state = mgr.get_state("p1")
        assert state.current_stage == "requirements"
        assert state.status == "running"

        mgr.complete_stage("p1", "requirements", {"summary": "done"})
        artifacts = mgr.get_artifacts("p1", "requirements")
        assert artifacts["summary"] == "done"

    def test_fail_stage(self):
        mgr = StateManager()
        mgr.create_pipeline("p1")
        mgr.start_stage("p1", "requirements")
        mgr.fail_stage("p1", "requirements", "something broke")
        history = mgr.get_stage_history("p1", "requirements")
        assert len(history) == 1
        assert history[0].status == "failed"

    def test_pipeline_completion(self):
        mgr = StateManager()
        mgr.create_pipeline("p1")
        mgr.complete_pipeline("p1")
        assert mgr.get_state("p1").status == "completed"

    def test_serialisation_roundtrip(self):
        mgr = StateManager()
        mgr.create_pipeline("p1", project_id="proj1")
        mgr.start_stage("p1", "requirements")
        mgr.complete_stage("p1", "requirements", {"data": "test"})
        mgr.log_message("p1", {"role": "analyst", "msg": "done"})

        data = mgr.to_dict("p1")
        mgr2 = StateManager()
        restored = mgr2.load_from_dict(data)
        assert restored.pipeline_id == "p1"
        assert restored.artifacts["requirements"]["data"] == "test"

    def test_get_nonexistent_pipeline_raises(self):
        mgr = StateManager()
        with pytest.raises(KeyError):
            mgr.get_state("nonexistent")


# ---------------------------------------------------------------------------
# Contract Validation Tests
# ---------------------------------------------------------------------------

from engine.contracts.messages import (
    AgentRequest,
    AgentResponse,
    CriticFeedback,
    PipelineEvent,
    AgentRole,
    EventType,
    StageStatus,
)
from engine.contracts.artifacts import (
    RequirementsDoc,
    ArchitectureDoc,
    TaskBreakdown,
    CodeArtifact,
)


class TestContracts:
    """Tests for Pydantic schema validation."""

    def test_agent_request_defaults(self):
        req = AgentRequest(
            pipeline_id="p1",
            stage="requirements",
            agent_role=AgentRole.REQUIREMENTS_ANALYST,
            task_description="Build a TODO app",
        )
        assert req.iteration == 1
        assert req.request_id  # auto-generated UUID

    def test_agent_response_validation(self):
        resp = AgentResponse(
            request_id="r1",
            pipeline_id="p1",
            stage="requirements",
            agent_role=AgentRole.REQUIREMENTS_ANALYST,
            status=StageStatus.COMPLETED,
            confidence_score=0.95,
        )
        assert resp.confidence_score == 0.95

    def test_confidence_score_bounds(self):
        with pytest.raises(Exception):
            AgentResponse(
                request_id="r1",
                pipeline_id="p1",
                stage="requirements",
                agent_role=AgentRole.REQUIREMENTS_ANALYST,
                status=StageStatus.COMPLETED,
                confidence_score=1.5,  # out of bounds
            )

    def test_requirements_doc_valid(self):
        doc = RequirementsDoc(
            summary="TODO app",
            functional_requirements=[],
            user_stories=[],
        )
        assert doc.summary == "TODO app"

    def test_pipeline_event(self):
        event = PipelineEvent(
            pipeline_id="p1",
            event_type=EventType.STAGE_STARTED,
            stage="requirements",
            message="Starting requirements analysis",
        )
        assert event.event_type == EventType.STAGE_STARTED


# ---------------------------------------------------------------------------
# Critic Loop Tests (with mock agent)
# ---------------------------------------------------------------------------

from engine.orchestrator.critic import CriticLoopController


class MockAgent:
    """Mock agent for testing the critic loop."""
    role = AgentRole.ENGINEER
    call_count = 0

    async def execute(self, request):
        self.call_count += 1
        return AgentResponse(
            request_id=request.request_id,
            pipeline_id=request.pipeline_id,
            stage=request.stage,
            agent_role=self.role,
            status=StageStatus.COMPLETED,
            artifacts={"code": "print('hello')"},
            iteration=request.iteration,
        )


class TestCriticLoop:
    """Tests for CriticLoopController."""

    @pytest.mark.asyncio
    async def test_no_critic_single_pass(self):
        critic = CriticLoopController(enable=False)
        agent = MockAgent()
        request = AgentRequest(
            pipeline_id="p1",
            stage="implementation",
            agent_role=AgentRole.ENGINEER,
            task_description="test",
        )
        response, feedbacks = await critic.run(agent, request)
        assert response.status == StageStatus.COMPLETED
        assert len(feedbacks) == 0
        assert agent.call_count == 1

    @pytest.mark.asyncio
    async def test_critic_approves_first_pass(self):
        async def review_fn(artifacts, stage, pipeline_id):
            return CriticFeedback(
                pipeline_id=pipeline_id,
                stage=stage,
                approved=True,
            )

        critic = CriticLoopController(max_iterations=3)
        agent = MockAgent()
        request = AgentRequest(
            pipeline_id="p1",
            stage="implementation",
            agent_role=AgentRole.ENGINEER,
            task_description="test",
        )
        response, feedbacks = await critic.run(agent, request, review_fn=review_fn)
        assert response.status == StageStatus.COMPLETED
        assert len(feedbacks) == 1
        assert feedbacks[0].approved is True

    @pytest.mark.asyncio
    async def test_critic_max_iterations(self):
        async def always_reject(artifacts, stage, pipeline_id):
            return CriticFeedback(
                pipeline_id=pipeline_id,
                stage=stage,
                approved=False,
                suggestions=["Try harder"],
            )

        critic = CriticLoopController(max_iterations=2)
        agent = MockAgent()
        agent.call_count = 0
        request = AgentRequest(
            pipeline_id="p1",
            stage="implementation",
            agent_role=AgentRole.ENGINEER,
            task_description="test",
        )
        response, feedbacks = await critic.run(agent, request, review_fn=always_reject)
        assert agent.call_count == 2  # max_iterations = 2
        assert len(feedbacks) == 2
        assert all(not f.approved for f in feedbacks)
