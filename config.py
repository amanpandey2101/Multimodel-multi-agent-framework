"""
Global configuration loaded from environment / .env file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Try loading dotenv if available
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass


@dataclass
class LLMConfig:
    """Configuration for a single LLM provider."""
    provider: str = "openai"
    model: str = "gpt-4o"
    api_key: str = ""
    base_url: Optional[str] = None
    temperature: float = 0.4
    max_tokens: int = 4096


@dataclass
class PipelineConfig:
    """Configuration for pipeline execution defaults."""
    max_critic_iterations: int = 3
    timeout_seconds: int = 600
    enable_critic_loop: bool = True
    workspace_dir: str = ""  # Defaults to temp directory if empty
    max_concurrency: int = 5


@dataclass
class Config:
    """Root application configuration."""

    # LLM providers
    default_provider: str = ""
    llm_configs: dict[str, LLMConfig] = field(default_factory=dict)

    # Pipeline
    pipeline: PipelineConfig = field(default_factory=PipelineConfig)

    # Infrastructure
    database_url: str = ""
    redis_url: str = ""

    # Auth
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # App
    debug: bool = False
    log_level: str = "INFO"


def load_config() -> Config:
    """Load configuration from environment variables."""

    llm_configs: dict[str, LLMConfig] = {
        "openai": LLMConfig(
            provider="openai",
            model=os.getenv("DEFAULT_OPENAI_MODEL", "gpt-4o"),
            api_key=os.getenv("OPENAI_API_KEY", ""),
        ),
        "anthropic": LLMConfig(
            provider="anthropic",
            model=os.getenv("DEFAULT_ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        ),
        "google": LLMConfig(
            provider="google",
            model=os.getenv("DEFAULT_GOOGLE_MODEL", "gemini-2.0-flash"),
            api_key=os.getenv("GOOGLE_API_KEY", ""),
        ),
        "ollama": LLMConfig(
            provider="ollama",
            model=os.getenv("DEFAULT_OLLAMA_MODEL", "llama3.2"),
            api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        ),
    }

    return Config(
        default_provider=os.getenv("DEFAULT_LLM_PROVIDER", "openai"),
        llm_configs=llm_configs,
        pipeline=PipelineConfig(
            max_critic_iterations=int(os.getenv("MAX_CRITIC_ITERATIONS", "3")),
            timeout_seconds=int(os.getenv("PIPELINE_TIMEOUT_SECONDS", "600")),
        ),
        database_url=os.getenv("DATABASE_URL", ""),
        redis_url=os.getenv("REDIS_URL", ""),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", ""),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")),
        debug=os.getenv("DEBUG", "false").lower() == "true",
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )
