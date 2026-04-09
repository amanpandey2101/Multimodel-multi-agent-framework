"""
Coordinator Agent — decomposes goals into task graphs and synthesises results.

The "killer feature" — a coordinator agent receives a high-level goal,
the team roster, and produces a structured task breakdown with assignments
and dependencies. After tasks complete, it synthesises a final answer.

Inspired by open-multi-agent's coordinator pattern and claude-source's
coordinatorMode.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class TaskSpec:
    """A task specification produced by the coordinator."""
    title: str
    description: str
    assignee: Optional[str] = None
    depends_on: list[str] = None

    def __post_init__(self):
        if self.depends_on is None:
            self.depends_on = []


def build_coordinator_system_prompt(agent_names: list[dict[str, str]]) -> str:
    """Build the system prompt for the coordinator agent."""
    roster = "\n".join(
        f"- **{a['name']}** ({a.get('model', 'default')}): "
        f"{a.get('system_prompt', 'general purpose agent')[:120]}"
        for a in agent_names
    )

    return "\n".join([
        "You are a task coordinator responsible for decomposing high-level goals",
        "into concrete, actionable tasks and assigning them to the right team members.",
        "",
        "## Team Roster",
        roster,
        "",
        "## Output Format",
        "When asked to decompose a goal, respond ONLY with a JSON array of task objects.",
        "Each task must have:",
        '  - "title":       Short descriptive title (string)',
        '  - "description": Full task description with context and expected output (string)',
        '  - "assignee":    One of the agent names listed in the roster (string)',
        '  - "dependsOn":   Array of titles of tasks this task depends on (string[], may be empty)',
        "",
        "Wrap the JSON in a ```json code fence.",
        "Do not include any text outside the code fence.",
        "",
        "## When synthesising results",
        "You will be given completed task outputs and asked to synthesise a final answer.",
        "Write a clear, comprehensive response that addresses the original goal.",
    ])


def build_decomposition_prompt(goal: str, agent_names: list[str]) -> str:
    """Build the prompt asking the coordinator to decompose a goal."""
    names = ", ".join(agent_names)
    return "\n".join([
        f"Decompose the following goal into tasks for your team ({names}).",
        "",
        "## Goal",
        goal,
        "",
        "Return ONLY the JSON task array in a ```json code fence.",
    ])


def build_synthesis_prompt(
    goal: str,
    completed_tasks: list[dict[str, Any]],
    failed_tasks: list[dict[str, Any]],
    memory_summary: str = "",
) -> str:
    """Build the prompt asking the coordinator to synthesise final results."""
    sections = ["## Original Goal", goal, ""]

    if completed_tasks:
        sections.append("## Completed Tasks")
        for task in completed_tasks:
            assignee = task.get("assignee", "unknown")
            sections.append(f"### {task['title']} (completed by {assignee})")
            sections.append(task.get("result", "(no output)"))
            sections.append("")

    if failed_tasks:
        sections.append("## Failed Tasks")
        for task in failed_tasks:
            sections.append(f"### {task['title']} (FAILED)")
            sections.append(f"Error: {task.get('result', 'unknown error')}")
            sections.append("")

    if memory_summary:
        sections.append(memory_summary)
        sections.append("")

    sections.extend([
        "## Your Task",
        "Synthesise the above results into a comprehensive final answer that addresses the original goal.",
        "If some tasks failed, note any gaps in the result.",
    ])

    return "\n".join(sections)


def parse_task_specs(raw: str) -> list[TaskSpec]:
    """
    Extract a JSON array of task specs from the coordinator's raw output.

    Handles:
    - ```json ... ``` fenced blocks
    - Bare JSON arrays
    - Mixed text with embedded JSON
    """
    # Strategy 1: look for a fenced JSON block
    fence_match = re.search(r"```json\s*([\s\S]*?)```", raw)
    candidate = fence_match.group(1) if fence_match else raw

    # Strategy 2: find the first '[' and last ']'
    array_start = candidate.find("[")
    array_end = candidate.rfind("]")
    if array_start == -1 or array_end == -1 or array_end <= array_start:
        logger.warning("Could not find task array in coordinator output")
        return []

    json_slice = candidate[array_start:array_end + 1]
    try:
        parsed = json.loads(json_slice)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse task JSON: %s", exc)
        return []

    if not isinstance(parsed, list):
        return []

    specs: list[TaskSpec] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        title = item.get("title")
        description = item.get("description")
        if not isinstance(title, str) or not isinstance(description, str):
            continue

        specs.append(TaskSpec(
            title=title,
            description=description,
            assignee=item.get("assignee") if isinstance(item.get("assignee"), str) else None,
            depends_on=[
                d for d in item.get("dependsOn", [])
                if isinstance(d, str)
            ],
        ))

    return specs
