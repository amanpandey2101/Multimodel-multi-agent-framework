"""
Task Queue — dependency-aware work queue for team orchestration.

Tasks have lifecycle: pending → in_progress → completed/failed/blocked.
Dependencies are auto-resolved: when a task completes, its dependents
are unblocked. When a task fails, its dependents are marked blocked.

Inspired by open-multi-agent's TaskQueue.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


@dataclass
class Task:
    """A discrete unit of work tracked by the orchestrator."""
    id: str
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    assignee: Optional[str] = None
    depends_on: list[str] = field(default_factory=list)  # Task IDs
    result: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        now = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now


def create_task(
    title: str,
    description: str,
    assignee: Optional[str] = None,
    depends_on: Optional[list[str]] = None,
) -> Task:
    """Factory for creating a new task with a generated ID."""
    return Task(
        id=str(uuid.uuid4())[:8],
        title=title,
        description=description,
        assignee=assignee,
        depends_on=depends_on or [],
    )


class TaskQueue:
    """
    Dependency-aware task queue.

    Manages task lifecycle and dependency resolution. Tasks whose
    dependencies are all completed become pending (ready to run).

    Usage::

        queue = TaskQueue()
        queue.add(task1)
        queue.add(task2)  # depends on task1

        pending = queue.get_pending()  # [task1]
        queue.complete(task1.id, "result...")
        pending = queue.get_pending()  # [task2] — auto-unblocked
    """

    def __init__(self) -> None:
        self._tasks: dict[str, Task] = {}

    def add(self, task: Task) -> None:
        # If task has unresolved dependencies, mark as blocked
        if task.depends_on:
            unresolved = [
                dep for dep in task.depends_on
                if dep not in self._tasks or self._tasks[dep].status != TaskStatus.COMPLETED
            ]
            if unresolved:
                task.status = TaskStatus.BLOCKED

        self._tasks[task.id] = task
        logger.debug("TaskQueue: added '%s' (status=%s)", task.title, task.status.value)

    def get(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def list(self) -> list[Task]:
        return list(self._tasks.values())

    def get_by_status(self, status: TaskStatus) -> list[Task]:
        return [t for t in self._tasks.values() if t.status == status]

    def get_pending(self) -> list[Task]:
        """Get tasks that are ready to run (pending with all deps satisfied)."""
        pending = []
        for task in self._tasks.values():
            if task.status != TaskStatus.PENDING:
                continue
            # Check all dependencies are completed
            deps_ok = all(
                self._tasks.get(dep_id) is not None
                and self._tasks[dep_id].status == TaskStatus.COMPLETED
                for dep_id in task.depends_on
            )
            if deps_ok:
                pending.append(task)
        return pending

    def update(self, task_id: str, **kwargs) -> None:
        """Update task fields."""
        task = self._tasks.get(task_id)
        if task:
            for key, value in kwargs.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            task.updated_at = datetime.now(timezone.utc).isoformat()

    def start(self, task_id: str) -> None:
        """Mark a task as in-progress."""
        self.update(task_id, status=TaskStatus.IN_PROGRESS)

    def complete(self, task_id: str, result: str) -> None:
        """Mark a task as completed and unblock dependents."""
        self.update(task_id, status=TaskStatus.COMPLETED, result=result)
        self._unblock_dependents(task_id)

    def fail(self, task_id: str, error: str) -> None:
        """Mark a task as failed and cascade to dependents."""
        self.update(task_id, status=TaskStatus.FAILED, result=error)
        self._cascade_failure(task_id)

    def _unblock_dependents(self, completed_id: str) -> None:
        """Check if any blocked tasks can now be unblocked."""
        for task in self._tasks.values():
            if task.status == TaskStatus.BLOCKED and completed_id in task.depends_on:
                # Check if ALL dependencies are now met
                all_met = all(
                    self._tasks.get(dep) is not None
                    and self._tasks[dep].status == TaskStatus.COMPLETED
                    for dep in task.depends_on
                )
                if all_met:
                    task.status = TaskStatus.PENDING
                    task.updated_at = datetime.now(timezone.utc).isoformat()
                    logger.info("TaskQueue: unblocked '%s'", task.title)

    def _cascade_failure(self, failed_id: str) -> None:
        """Mark tasks depending on the failed task as blocked."""
        for task in self._tasks.values():
            if failed_id in task.depends_on and task.status in (
                TaskStatus.PENDING, TaskStatus.BLOCKED
            ):
                task.status = TaskStatus.BLOCKED
                task.result = f"Blocked by failed dependency: {failed_id}"
                task.updated_at = datetime.now(timezone.utc).isoformat()
                logger.warning("TaskQueue: '%s' blocked due to failed dependency", task.title)

    def is_complete(self) -> bool:
        """True if all tasks are in a terminal state."""
        return all(
            t.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.BLOCKED)
            for t in self._tasks.values()
        )

    def to_dict(self) -> list[dict[str, Any]]:
        return [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description[:200],
                "status": t.status.value,
                "assignee": t.assignee,
                "depends_on": t.depends_on,
                "result": t.result[:500] if t.result else None,
            }
            for t in self._tasks.values()
        ]

    def __len__(self) -> int:
        return len(self._tasks)
