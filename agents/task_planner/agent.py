"""
Task Planner Agent — breaks requirements + architecture into implementation tasks.
"""

from __future__ import annotations

import json
from typing import Any

from agents.base.agent import BaseAgent
from agents.base.llm_provider import LLMProvider, Message
from engine.contracts.messages import AgentRequest, AgentRole
from engine.contracts.artifacts import TaskBreakdown
from agents.task_planner.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, FEEDBACK_SECTION


class TaskPlannerAgent(BaseAgent):
    role = AgentRole.TASK_PLANNER
    output_schema = TaskBreakdown

    def __init__(self, llm_provider: LLMProvider):
        super().__init__(llm_provider)

    def build_prompt(self, request: AgentRequest) -> list[Message]:
        feedback_section = self._format_feedback(request, FEEDBACK_SECTION)
        mode = str((request.constraints or {}).get("mode", "creation")).lower()
        is_update = bool((request.constraints or {}).get("is_update")) or mode == "evolution"

        requirements = json.dumps(
            request.context_artifacts.get("requirements", {}), indent=2
        )
        architecture = json.dumps(
            request.context_artifacts.get("architecture", {}), indent=2
        )
        task_breakdown = json.dumps(
            request.context_artifacts.get("task_breakdown", {}), indent=2
        )
        constraints_str = json.dumps(request.constraints, indent=2) if request.constraints else "None"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            task_description=request.task_description,
            requirements=requirements,
            architecture=architecture,
            current_tasks=task_breakdown,
            constraints=constraints_str,
            mode=mode,
            planning_directive=(
                "You are updating an existing project. Return a delta task plan only."
                if is_update
                else "You are creating a new project. Include bootstrapping, configuration, and runnable setup tasks."
            ),
            feedback_section=feedback_section,
        )

        return [
            Message(role="system", content=SYSTEM_PROMPT),
            Message(role="user", content=user_prompt),
        ]

    def parse_response(self, raw_content: str, request: AgentRequest) -> dict[str, Any]:
        # Some small models occasionally return an empty body for JSON-mode calls.
        # Keep the pipeline moving by producing a deterministic, schema-valid fallback plan.
        if not raw_content or not raw_content.strip():
            return self._build_fallback_task_breakdown(request)
        return self._safe_json_parse(raw_content)

    def _temperature(self) -> float:
        return 0.3

    def _max_tokens(self) -> int:
        return 6144  # Task breakdowns with subtasks can be lengthy

    def _build_fallback_task_breakdown(self, request: AgentRequest) -> dict[str, Any]:
        architecture = request.context_artifacts.get("architecture", {}) or {}
        requirements = request.context_artifacts.get("requirements", {}) or {}
        mode = str((request.constraints or {}).get("mode", "creation")).lower()
        is_update = bool((request.constraints or {}).get("is_update")) or mode == "evolution"

        tasks: list[dict[str, Any]] = []
        implementation_order: list[str] = []

        def add_task(
            task_id: str,
            title: str,
            description: str,
            priority: str = "high",
            complexity: str = "medium",
            dependencies: list[str] | None = None,
            component: str | None = None,
        ) -> None:
            tasks.append({
                "id": task_id,
                "title": title,
                "description": description,
                "priority": priority,
                "estimated_complexity": complexity,
                "dependencies": dependencies or [],
                "subtasks": [],
                "assigned_component": component,
            })
            implementation_order.append(task_id)

        if not is_update:
            add_task(
                "T-001",
                "Initialize project scaffold",
                "Set up base project files and scripts (package.json, tsconfig, entry files, lint/test scripts).",
                complexity="low",
                component="Project Bootstrap",
            )

        components = architecture.get("components", [])
        component_names: list[str] = []
        if isinstance(components, list):
            for comp in components:
                if isinstance(comp, dict):
                    name = str(comp.get("name", "")).strip()
                    if name:
                        component_names.append(name)

        if component_names:
            for idx, name in enumerate(component_names, start=2 if not is_update else 1):
                task_id = f"T-{idx:03d}"
                deps = ["T-001"] if (not is_update and idx == 2) else []
                add_task(
                    task_id,
                    f"Implement {name}",
                    f"Build and integrate the '{name}' component according to the architecture contract and connect it with related modules.",
                    dependencies=deps,
                    component=name,
                )
        else:
            add_task(
                "T-002" if not is_update else "T-001",
                "Implement core functionality",
                "Implement core user workflows and wire up persistence, validation, and UI flow from requirements.",
                dependencies=(["T-001"] if not is_update else []),
                component="Core",
            )

        last_task_id = implementation_order[-1] if implementation_order else None
        review_task_id = f"T-{len(implementation_order) + 1:03d}"
        add_task(
            review_task_id,
            "Testing and quality checks",
            "Add or update tests, run linting, and validate acceptance criteria against requirements.",
            priority="medium",
            complexity="medium",
            dependencies=([last_task_id] if last_task_id else []),
            component="Quality",
        )

        req_summary = requirements.get("summary", "")
        summary = (
            "Fallback task breakdown generated due to empty LLM output. "
            "Plan prioritizes runnable implementation and validation."
        )
        if isinstance(req_summary, str) and req_summary.strip():
            summary = f"{summary} Context: {req_summary[:180]}"

        return {
            "summary": summary,
            "tasks": tasks,
            "implementation_order": implementation_order,
            "total_estimated_effort": "1-3 days",
        }
