"""
DAG Scheduler — deterministic topological execution of pipeline stages.

Each pipeline is modelled as a directed acyclic graph where nodes are stages
and edges represent data dependencies.  The scheduler maintains node lifecycle
status, enforces dependency satisfaction, and supports parallel dispatch of
independent nodes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class NodeStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class DAGNode:
    """A single stage in the execution graph."""
    id: str
    name: str
    agent_role: str
    dependencies: list[str] = field(default_factory=list)
    status: NodeStatus = NodeStatus.PENDING
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    iteration: int = 0
    max_iterations: int = 3

    def is_terminal(self) -> bool:
        return self.status in (NodeStatus.COMPLETED, NodeStatus.FAILED, NodeStatus.SKIPPED)


class DAGScheduler:
    """
    Manages the execution DAG for a pipeline.

    Typical usage::

        dag = DAGScheduler()
        dag.add_node("requirements", "Requirements Analysis", "requirements_analyst")
        dag.add_node("architecture", "System Architecture", "architect", deps=["requirements"])
        dag.add_node("tasks", "Task Planning", "task_planner", deps=["requirements", "architecture"])
        dag.add_node("implementation", "Code Implementation", "engineer", deps=["tasks"])
        dag.add_node("review", "Code Review", "reviewer", deps=["implementation"])
        dag.add_node("deployment", "Deployment Config", "devops", deps=["implementation"])

        order = dag.topological_sort()
        ready = dag.get_ready_nodes()
    """

    def __init__(self) -> None:
        self._nodes: dict[str, DAGNode] = {}
        self._execution_order: list[str] = []

    # ------------------------------------------------------------------
    # Graph construction
    # ------------------------------------------------------------------

    def add_node(
        self,
        node_id: str,
        name: str,
        agent_role: str,
        deps: Optional[list[str]] = None,
        max_iterations: int = 3,
    ) -> DAGNode:
        """Add a stage node to the graph."""
        if node_id in self._nodes:
            raise ValueError(f"Duplicate node ID: {node_id}")
        node = DAGNode(
            id=node_id,
            name=name,
            agent_role=agent_role,
            dependencies=deps or [],
            max_iterations=max_iterations,
        )
        self._nodes[node_id] = node
        self._execution_order = []  # invalidate cached sort
        return node

    # ------------------------------------------------------------------
    # Scheduling
    # ------------------------------------------------------------------

    def topological_sort(self) -> list[str]:
        """
        Kahn's algorithm — returns a deterministic topological ordering.

        Raises ``ValueError`` if the graph contains cycles.
        """
        if self._execution_order:
            return list(self._execution_order)

        in_degree: dict[str, int] = {nid: 0 for nid in self._nodes}
        for node in self._nodes.values():
            for dep in node.dependencies:
                if dep not in self._nodes:
                    raise ValueError(f"Node '{node.id}' depends on unknown node '{dep}'")

        # Count in-degrees
        for node in self._nodes.values():
            for dep in node.dependencies:
                # dep → node, so node's in-degree increases (but we track edges as
                # "this node depends on dep", so dep has an outgoing edge to node)
                pass
        # Re-compute properly
        in_degree = {nid: 0 for nid in self._nodes}
        for node in self._nodes.values():
            in_degree.setdefault(node.id, 0)
            for dep in node.dependencies:
                # node depends on dep ⇒ edge dep→node
                in_degree[node.id] = in_degree.get(node.id, 0)
        # Actually: in_degree[node_id] = number of dependencies
        in_degree = {nid: len(n.dependencies) for nid, n in self._nodes.items()}

        queue: list[str] = sorted(
            [nid for nid, deg in in_degree.items() if deg == 0]
        )
        result: list[str] = []

        while queue:
            current = queue.pop(0)
            result.append(current)
            # Reduce in-degree for nodes that depend on current
            for nid, node in self._nodes.items():
                if current in node.dependencies:
                    in_degree[nid] -= 1
                    if in_degree[nid] == 0:
                        queue.append(nid)
            queue.sort()  # deterministic ordering

        if len(result) != len(self._nodes):
            raise ValueError("Cycle detected in DAG!")

        self._execution_order = result
        return list(result)

    def get_ready_nodes(self) -> list[DAGNode]:
        """Return nodes whose dependencies are all COMPLETED and that are PENDING."""
        ready: list[DAGNode] = []
        for node in self._nodes.values():
            if node.status != NodeStatus.PENDING:
                continue
            deps_satisfied = all(
                self._nodes[dep].status == NodeStatus.COMPLETED
                for dep in node.dependencies
            )
            if deps_satisfied:
                ready.append(node)
        return ready

    # ------------------------------------------------------------------
    # Status management
    # ------------------------------------------------------------------

    def mark_running(self, node_id: str) -> None:
        self._nodes[node_id].status = NodeStatus.RUNNING

    def mark_completed(self, node_id: str, result: dict[str, Any] | None = None) -> None:
        node = self._nodes[node_id]
        node.status = NodeStatus.COMPLETED
        node.result = result

    def mark_failed(self, node_id: str, error: str = "") -> None:
        node = self._nodes[node_id]
        node.status = NodeStatus.FAILED
        node.error = error

    def mark_skipped(self, node_id: str) -> None:
        self._nodes[node_id].status = NodeStatus.SKIPPED

    def reset_node(self, node_id: str) -> None:
        """Reset a node back to PENDING (for re-runs after critic feedback)."""
        node = self._nodes[node_id]
        node.status = NodeStatus.PENDING
        node.result = None
        node.error = None
        node.iteration += 1

    def increment_iteration(self, node_id: str) -> int:
        """Increment and return the iteration count for a node."""
        node = self._nodes[node_id]
        node.iteration += 1
        return node.iteration

    def get_node(self, node_id: str) -> DAGNode:
        return self._nodes[node_id]

    def is_complete(self) -> bool:
        """True if all nodes are in a terminal state."""
        return all(n.is_terminal() for n in self._nodes.values())

    def has_failures(self) -> bool:
        return any(n.status == NodeStatus.FAILED for n in self._nodes.values())

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Serialise the full DAG state for persistence."""
        return {
            "nodes": {
                nid: {
                    "id": n.id,
                    "name": n.name,
                    "agent_role": n.agent_role,
                    "dependencies": n.dependencies,
                    "status": n.status.value,
                    "iteration": n.iteration,
                    "max_iterations": n.max_iterations,
                    "error": n.error,
                }
                for nid, n in self._nodes.items()
            },
            "execution_order": self._execution_order,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DAGScheduler":
        """Restore a DAG from serialised state."""
        dag = cls()
        for nid, nd in data.get("nodes", {}).items():
            node = dag.add_node(
                nid,
                nd["name"],
                nd["agent_role"],
                deps=nd.get("dependencies", []),
                max_iterations=nd.get("max_iterations", 3),
            )
            node.status = NodeStatus(nd.get("status", "pending"))
            node.iteration = nd.get("iteration", 0)
            node.error = nd.get("error")
        dag._execution_order = data.get("execution_order", [])
        return dag

    @property
    def nodes(self) -> dict[str, DAGNode]:
        return dict(self._nodes)

    def __repr__(self) -> str:
        statuses = ", ".join(f"{n.id}={n.status.value}" for n in self._nodes.values())
        return f"DAGScheduler({statuses})"
