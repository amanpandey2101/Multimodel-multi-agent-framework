"""
Cost Tracker — accumulates token usage and cost across agents.

Supports per-provider pricing with per-agent and per-stage breakdowns.
Inspired by claude-source's cost-tracker.ts.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Pricing per 1M tokens (input / output) in USD
MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    "o1": (15.00, 60.00),
    "o1-mini": (3.00, 12.00),
    # Anthropic
    "claude-sonnet-4-20250514": (3.00, 15.00),
    "claude-opus-4-20250514": (15.00, 75.00),
    "claude-3-5-haiku-20241022": (0.80, 4.00),
    # Google
    "gemini-1.5-pro": (1.25, 5.00),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-2.0-flash": (0.10, 0.40),
    # Ollama / local
    "llama3": (0.0, 0.0),
    "llama3.1": (0.0, 0.0),
    "mixtral": (0.0, 0.0),
    "codellama": (0.0, 0.0),
}


@dataclass
class UsageEntry:
    """A single recorded usage event."""
    agent: str
    stage: str
    model: str
    provider: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    tool_calls: int = 0


@dataclass
class CostTracker:
    """
    Accumulates token usage and cost metrics across pipeline execution.

    Usage::

        tracker = CostTracker()
        tracker.record("engineer", "implementation", "gpt-4o", "openai", 500, 1200)
        print(tracker.total_cost_usd)
        print(tracker.get_summary())
    """
    entries: list[UsageEntry] = field(default_factory=list)

    def record(
        self,
        agent: str,
        stage: str,
        model: str,
        provider: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        tool_calls: int = 0,
    ) -> None:
        """Record a usage event and compute cost."""
        cost = self._compute_cost(model, prompt_tokens, completion_tokens)
        entry = UsageEntry(
            agent=agent,
            stage=stage,
            model=model,
            provider=provider,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            cost_usd=cost,
            tool_calls=tool_calls,
        )
        self.entries.append(entry)
        logger.debug(
            "CostTracker: %s/%s — %d tokens, $%.4f",
            agent, stage, entry.total_tokens, cost,
        )

    def _compute_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Compute cost in USD based on model pricing."""
        pricing = MODEL_PRICING.get(model)
        if not pricing:
            # Try partial match
            for model_key, price in MODEL_PRICING.items():
                if model_key in model or model in model_key:
                    pricing = price
                    break
        if not pricing:
            return 0.0

        input_rate, output_rate = pricing
        return (input_tokens * input_rate / 1_000_000) + (output_tokens * output_rate / 1_000_000)

    # ── Aggregation ──────────────────────────────────────────────────

    @property
    def total_prompt_tokens(self) -> int:
        return sum(e.prompt_tokens for e in self.entries)

    @property
    def total_completion_tokens(self) -> int:
        return sum(e.completion_tokens for e in self.entries)

    @property
    def total_tokens(self) -> int:
        return sum(e.total_tokens for e in self.entries)

    @property
    def total_cost_usd(self) -> float:
        return sum(e.cost_usd for e in self.entries)

    @property
    def total_tool_calls(self) -> int:
        return sum(e.tool_calls for e in self.entries)

    def by_agent(self) -> dict[str, dict[str, Any]]:
        """Token usage and cost grouped by agent."""
        grouped: dict[str, dict[str, Any]] = {}
        for e in self.entries:
            if e.agent not in grouped:
                grouped[e.agent] = {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "cost_usd": 0.0,
                    "tool_calls": 0,
                    "calls": 0,
                }
            g = grouped[e.agent]
            g["prompt_tokens"] += e.prompt_tokens
            g["completion_tokens"] += e.completion_tokens
            g["total_tokens"] += e.total_tokens
            g["cost_usd"] += e.cost_usd
            g["tool_calls"] += e.tool_calls
            g["calls"] += 1
        return grouped

    def by_stage(self) -> dict[str, dict[str, Any]]:
        """Token usage and cost grouped by stage."""
        grouped: dict[str, dict[str, Any]] = {}
        for e in self.entries:
            if e.stage not in grouped:
                grouped[e.stage] = {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "cost_usd": 0.0,
                }
            g = grouped[e.stage]
            g["prompt_tokens"] += e.prompt_tokens
            g["completion_tokens"] += e.completion_tokens
            g["total_tokens"] += e.total_tokens
            g["cost_usd"] += e.cost_usd
        return grouped

    def get_summary(self) -> dict[str, Any]:
        """Full summary for API/frontend consumption."""
        return {
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_completion_tokens": self.total_completion_tokens,
            "total_tokens": self.total_tokens,
            "total_cost_usd": round(self.total_cost_usd, 6),
            "total_tool_calls": self.total_tool_calls,
            "by_agent": self.by_agent(),
            "by_stage": self.by_stage(),
            "entries_count": len(self.entries),
        }

    def to_dict(self) -> dict[str, Any]:
        return self.get_summary()
