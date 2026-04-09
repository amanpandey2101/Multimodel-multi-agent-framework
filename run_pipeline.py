"""
CLI runner — convenience script to execute a full pipeline.

Usage:
    # With OpenAI (default)
    python run_pipeline.py "Build a TODO app with React and Node.js"

    # With Ollama (local, free)
    python run_pipeline.py "Build a TODO app" --provider ollama --model llama3.2

    # With Anthropic
    python run_pipeline.py "Build a TODO app" --provider anthropic

    # Disable critic loop for faster testing
    python run_pipeline.py "Build a TODO app" --provider ollama --no-critic

    # List available Ollama models
    python run_pipeline.py --list-models
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

# Ensure project root is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from agents.base.llm_provider import create_provider, OllamaProvider
from agents.requirements_analyst.agent import RequirementsAnalystAgent
from agents.architect.agent import ArchitectAgent
from agents.task_planner.agent import TaskPlannerAgent
from agents.engineer.agent import EngineerAgent
from agents.reviewer.agent import ReviewerAgent
from agents.devops.agent import DevOpsAgent
from engine.orchestrator.pipeline import PipelineOrchestrator
from engine.orchestrator.state import StateManager
from engine.orchestrator.critic import CriticLoopController
from engine.contracts.messages import PipelineEvent
from config import load_config


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pipeline_runner")


async def event_handler(event: PipelineEvent) -> None:
    """Print pipeline events to console with colour coding."""
    icons = {
        "pipeline_started": "🚀",
        "stage_started": "▶️ ",
        "stage_completed": "✅",
        "stage_failed": "❌",
        "critic_iteration": "🔄",
        "pipeline_completed": "🎉",
        "pipeline_failed": "💥",
        "log": "📝",
        "artifact_produced": "📦",
    }
    icon = icons.get(event.event_type.value, "•")
    print(f"  {icon} {event.message}")


async def list_ollama_models(base_url: str = "http://localhost:11434") -> None:
    """List locally available Ollama models."""
    provider = OllamaProvider(base_url=base_url)
    healthy = await provider.check_health()
    if not healthy:
        print("❌ Ollama is not running. Start it with: ollama serve")
        return

    models = await provider.list_local_models()
    if models:
        print("📋 Available Ollama models:")
        for m in models:
            print(f"   • {m}")
    else:
        print("No models found. Pull one with: ollama pull llama3.2")


async def run_pipeline(
    requirement: str,
    provider_name: str = "openai",
    model: str | None = None,
    enable_critic: bool = True,
    max_iterations: int = 3,
    output_file: str | None = None,
) -> dict:
    """Run the full pipeline and return results."""
    config = load_config()

    # Create LLM provider
    provider_config = config.llm_configs.get(provider_name)
    llm = create_provider(
        provider_name,
        api_key=provider_config.api_key if provider_config else None,
        default_model=model or (provider_config.model if provider_config else None),
        base_url=provider_config.base_url if provider_config else None,
    )

    # Health check
    healthy = await llm.check_health()
    if not healthy:
        logger.error("LLM provider '%s' is not reachable!", provider_name)
        if provider_name == "ollama":
            logger.error("Make sure Ollama is running: ollama serve")
        else:
            logger.error("Check your API key in .env")
        return {"status": "failed", "error": "Provider not reachable"}

    logger.info("Using provider: %s (model: %s)", provider_name, model or "default")

    # Create all agents with the same provider
    agents = {
        "requirements_analyst": RequirementsAnalystAgent(llm),
        "architect": ArchitectAgent(llm),
        "task_planner": TaskPlannerAgent(llm),
        "engineer": EngineerAgent(llm),
        "reviewer": ReviewerAgent(llm),
        "devops": DevOpsAgent(llm),
    }

    # State + Critic
    state_manager = StateManager()
    reviewer = agents["reviewer"]
    critic = CriticLoopController(
        max_iterations=max_iterations,
        enable=enable_critic,
    )

    # Orchestrator
    orchestrator = PipelineOrchestrator(
        agents=agents,
        state_manager=state_manager,
        critic_controller=critic,
        event_callback=event_handler,
        review_fn=reviewer.review_artifacts if enable_critic else None,
    )

    print(f"\n{'='*60}")
    print(f"  Pipeline: {requirement[:56]}")
    print(f"  Provider: {provider_name} | Critic: {'ON' if enable_critic else 'OFF'}")
    print(f"{'='*60}\n")

    result = await orchestrator.run(requirement=requirement)

    print(f"\n{'='*60}")
    print(f"  Pipeline {result['status'].upper()}")
    print(f"{'='*60}\n")

    # Save output
    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        logger.info("Results saved to %s", output_file)

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Run the autonomous software engineering pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py "Build a TODO app with React"
  python run_pipeline.py "Build a REST API" --provider ollama --model codellama
  python run_pipeline.py "Build a CLI tool" --provider anthropic --no-critic
  python run_pipeline.py --list-models
        """,
    )
    parser.add_argument(
        "requirement",
        nargs="?",
        help="The software requirement to implement",
    )
    parser.add_argument(
        "--provider", "-p",
        default=None,
        choices=["openai", "anthropic", "google", "ollama"],
        help="LLM provider to use (default: from .env or openai)",
    )
    parser.add_argument(
        "--model", "-m",
        default=None,
        help="Specific model to use (e.g. gpt-4o, llama3.2, codellama)",
    )
    parser.add_argument(
        "--no-critic",
        action="store_true",
        help="Disable the critic review loop (faster but no refinement)",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=3,
        help="Max critic loop iterations (default: 3)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Save results to JSON file",
    )
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List available Ollama models and exit",
    )

    args = parser.parse_args()

    if args.list_models:
        asyncio.run(list_ollama_models())
        return

    if not args.requirement:
        parser.error("requirement is required unless using --list-models")

    config = load_config()
    provider = args.provider or config.default_provider

    result = asyncio.run(run_pipeline(
        requirement=args.requirement,
        provider_name=provider,
        model=args.model,
        enable_critic=not args.no_critic,
        max_iterations=args.max_iterations,
        output_file=args.output,
    ))

    # Exit code based on result
    sys.exit(0 if result.get("status") == "completed" else 1)


if __name__ == "__main__":
    main()
