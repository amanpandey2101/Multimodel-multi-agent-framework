"""
Team Orchestration CLI — run multi-agent teams from the command line.

Usage:
    python run_team.py "Build a REST API for a blog" --provider openai
    python run_team.py "Analyze and refactor this codebase" --provider ollama --model llama3
    python run_team.py "Write a Python web scraper" --team custom --agents "architect,developer,reviewer"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import tempfile
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

from agents.teams.team import AgentConfig, TeamConfig
from engine.orchestrator.team_orchestrator import TeamOrchestrator

# ──── Default Agent Templates ─────────────────────────────────────────

DEFAULT_AGENTS: dict[str, AgentConfig] = {
    "architect": AgentConfig(
        name="architect",
        system_prompt=(
            "You are a senior software architect. When given a goal, design the "
            "system architecture including modules, APIs, data models, and technology "
            "choices. Produce clear, actionable architecture documents."
        ),
    ),
    "developer": AgentConfig(
        name="developer",
        system_prompt=(
            "You are an expert software developer. Implement code based on the "
            "architecture and requirements provided. Write clean, well-documented, "
            "production-quality code. Use tools like bash and file_write to create "
            "actual files when asked."
        ),
    ),
    "reviewer": AgentConfig(
        name="reviewer",
        system_prompt=(
            "You are a meticulous code reviewer. Review code for bugs, security "
            "issues, performance problems, and adherence to best practices. "
            "Provide specific, actionable feedback with file paths and line numbers."
        ),
    ),
    "researcher": AgentConfig(
        name="researcher",
        system_prompt=(
            "You are a thorough technical researcher. Research technologies, APIs, "
            "libraries, and best practices. Provide comprehensive summaries with "
            "pros/cons and recommendations."
        ),
    ),
    "tester": AgentConfig(
        name="tester",
        system_prompt=(
            "You are a QA engineer. Write comprehensive test plans, unit tests, "
            "integration tests, and end-to-end tests. Focus on edge cases and "
            "ensure high code coverage."
        ),
    ),
}

# ──── Pre-built Team Templates ────────────────────────────────────────

TEAM_TEMPLATES: dict[str, list[str]] = {
    "full": ["architect", "developer", "reviewer", "tester"],
    "dev": ["architect", "developer"],
    "review": ["developer", "reviewer"],
    "research": ["researcher", "developer"],
}


def build_team_config(
    team_name: str,
    agent_names: list[str],
    provider: str,
    model: str,
    max_concurrency: int,
) -> TeamConfig:
    """Build a TeamConfig from agent names and LLM settings."""
    configs = []
    for name in agent_names:
        template = DEFAULT_AGENTS.get(name)
        if template:
            config = AgentConfig(
                name=name,
                model=model,
                provider=provider,
                system_prompt=template.system_prompt,
            )
        else:
            config = AgentConfig(
                name=name,
                model=model,
                provider=provider,
                system_prompt=f"You are a helpful AI assistant named {name}.",
            )
        configs.append(config)

    return TeamConfig(
        name=team_name,
        agents=configs,
        shared_memory=True,
        max_concurrency=max_concurrency,
    )


async def run(args: argparse.Namespace) -> None:
    """Run the team orchestration."""
    # Determine agents
    if args.agents:
        agent_names = [a.strip() for a in args.agents.split(",")]
    elif args.team in TEAM_TEMPLATES:
        agent_names = TEAM_TEMPLATES[args.team]
    else:
        agent_names = TEAM_TEMPLATES["dev"]

    # Build config
    team_config = build_team_config(
        team_name=args.team,
        agent_names=agent_names,
        provider=args.provider,
        model=args.model,
        max_concurrency=args.concurrency,
    )

    # Workspace directory
    workspace = args.workspace
    if not workspace:
        workspace = tempfile.mkdtemp(prefix="multiagent_")
    os.makedirs(workspace, exist_ok=True)

    # Progress callback
    def on_progress(event: dict):
        event_type = event.get("type", "")
        agent = event.get("agent", "")
        task = event.get("task", "")

        icons = {
            "agent_start": "🚀",
            "agent_complete": "✅",
            "task_start": "📋",
            "task_complete": "✅",
            "error": "❌",
            "message": "💬",
        }
        icon = icons.get(event_type, "📌")
        timestamp = datetime.now().strftime("%H:%M:%S")

        details = ""
        if agent:
            details += f" [{agent}]"
        if task:
            details += f" task={task[:8]}"

        data = event.get("data", "")
        if isinstance(data, dict):
            phase = data.get("phase", "")
            if phase:
                details += f" ({phase})"
        elif isinstance(data, str) and data:
            details += f" — {data}"

        print(f"  {icon} {timestamp}{details}")

    # Create orchestrator
    orchestrator = TeamOrchestrator(
        default_provider=args.provider,
        default_model=args.model,
        max_concurrency=args.concurrency,
        on_progress=on_progress,
        workspace_dir=workspace,
    )

    # Interactive plan approval callback
    async def approve_plan(plan_data: dict) -> bool:
        print("\n" + "=" * 60)
        print("  📝 Proposed Plan")
        print("=" * 60)
        tasks = plan_data.get("tasks", [])
        for i, task in enumerate(tasks, 1):
            assignee = task.get("assignee") or "unassigned"
            print(f"  {i}. [{assignee}] {task.get('title')}")
            for dep in task.get("depends_on", []):
                print(f"     ↳ Depends on: {dep}")
        print("=" * 60)
        if args.yes:
            print("  Auto-approving plan (--yes is set).")
            return True
        import sys
        print("\n  Do you want to proceed with this plan? [y/N]: ", end="", flush=True)
        response = sys.stdin.readline().strip().lower()
        return response in ("y", "yes")

    # Create team
    team = orchestrator.create_team(team_config)

    # Print header
    print()
    print("=" * 60)
    print("  🤖 Multi-Agent Team Orchestrator")
    print("=" * 60)
    print(f"  Goal:      {args.goal}")
    print(f"  Team:      {args.team} ({', '.join(agent_names)})")
    print(f"  Provider:  {args.provider} / {args.model}")
    print(f"  Workspace: {workspace}")
    print(f"  Max concurrency: {args.concurrency}")
    print(f"  Mode:      {args.mode}")
    print("=" * 60)
    print()

    # Run
    try:
        result = await orchestrator.run_team(
            team, 
            args.goal, 
            mode=args.mode,
            plan_approval_callback=approve_plan if args.mode == "planning" else None
        )
    except Exception as exc:
        print(f"\n❌ Team orchestration failed: {exc}")
        logging.exception("Orchestration error")
        sys.exit(1)

    # Print results
    print()
    print("=" * 60)
    print("  📊 Results")
    print("=" * 60)
    print()

    # Task summary
    tasks = result.get("tasks", [])
    completed = sum(1 for t in tasks if t["status"] == "completed")
    failed = sum(1 for t in tasks if t["status"] == "failed")
    print(f"  Tasks: {completed} completed, {failed} failed, {len(tasks)} total")

    # Token usage
    usage = result.get("total_token_usage", {})
    if usage:
        print(f"  Tokens: {usage.get('prompt_tokens', 0):,} prompt + "
              f"{usage.get('completion_tokens', 0):,} completion")

    print()
    print("─" * 60)
    print("  Final Output:")
    print("─" * 60)
    print()
    print(result.get("output", "(no output)"))
    print()

    # Save output
    output_file = os.path.join(workspace, "result.json")
    with open(output_file, "w") as f:
        json.dump(result, f, indent=2, default=str)
    print(f"  💾 Full results saved to: {output_file}")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Run multi-agent team orchestration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_team.py "Build a REST API" --provider openai --model gpt-4o
  python run_team.py "Write a Python CLI tool" --team dev --provider ollama --model llama3
  python run_team.py "Refactor this codebase" --agents "architect,developer,reviewer"
        """,
    )
    parser.add_argument(
        "goal",
        help="High-level goal for the team to accomplish",
    )
    parser.add_argument(
        "--provider",
        default=os.getenv("DEFAULT_LLM_PROVIDER", "openai"),
        choices=["openai", "anthropic", "google", "ollama"],
    )
    parser.add_argument(
        "--model",
        default=os.getenv("DEFAULT_LLM_MODEL", "gpt-4o"),
    )
    parser.add_argument(
        "--team",
        default="dev",
        help="Team template: full, dev, review, research (default: dev)",
    )
    parser.add_argument(
        "--agents",
        default="",
        help="Comma-separated agent names (overrides --team)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=3,
    )
    parser.add_argument(
        "--workspace",
        default="",
        help="Working directory for tool operations",
    )
    parser.add_argument(
        "--mode",
        choices=["fast", "planning"],
        default="planning",
        help="Execution mode: 'fast' (straight to implementation) or 'planning' (coordinator plans first)",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Auto-approve the plan in planning mode",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    )
    # Quiet noisy libs
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("anthropic").setLevel(logging.WARNING)

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
