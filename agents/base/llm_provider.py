"""
Model-agnostic LLM provider abstraction.

Supports OpenAI, Anthropic, Google (Gemini), and **Ollama** (local models).
Ollama integration uses its OpenAI-compatible API endpoint, making it trivial
to swap between cloud and local models for development and testing.

Provider selection:
    provider = create_provider("ollama")       # local Ollama
    provider = create_provider("openai")       # OpenAI API
    provider = create_provider("anthropic")    # Anthropic API
    provider = create_provider("google")       # Google Gemini API
"""

from __future__ import annotations

import json
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

class ProviderName(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OLLAMA = "ollama"


@dataclass
class LLMResponse:
    """Normalised response from any LLM provider."""
    content: str
    model: str
    provider: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    finish_reason: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)
    latency_ms: int = 0
    cost_estimate_usd: float = 0.0
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Message:
    """Chat message (provider-agnostic)."""
    role: str          # "system" | "user" | "assistant" | "tool"
    content: str
    tool_calls: Optional[list[dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Abstract Base
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    """Abstract interface that all LLM providers must implement."""

    provider_name: str

    @abstractmethod
    async def generate(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict[str, Any]] = None,
        stop: Optional[list[str]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        """Send a chat-completion request and return a normalised response."""
        ...

    @abstractmethod
    async def generate_stream(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        """Yield content chunks for streaming UI updates."""
        ...

    @abstractmethod
    async def check_health(self) -> bool:
        """Return True if the provider is reachable and authenticated."""
        ...


# ---------------------------------------------------------------------------
# OpenAI Provider
# ---------------------------------------------------------------------------

class OpenAIProvider(LLMProvider):
    """OpenAI API provider (GPT-4o, GPT-4, GPT-3.5-turbo, …)."""

    provider_name = ProviderName.OPENAI.value

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise ImportError("Install openai: pip install openai")

        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.default_model = default_model or os.getenv("DEFAULT_OPENAI_MODEL", "gpt-4o")
        kwargs: dict[str, Any] = {"api_key": self.api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self._client = AsyncOpenAI(**kwargs)

    async def generate(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict[str, Any]] = None,
        stop: Optional[list[str]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        model = model or self.default_model
        start = time.perf_counter_ns()

        # Build messages with tool support
        api_messages = []
        for m in messages:
            msg: dict[str, Any] = {"role": m.role, "content": m.content}
            if m.tool_calls:
                msg["tool_calls"] = m.tool_calls
            if m.tool_call_id:
                msg["tool_call_id"] = m.tool_call_id
            api_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": api_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format
        if stop:
            kwargs["stop"] = stop
        if tools:
            kwargs["tools"] = tools

        response = await self._client.chat.completions.create(**kwargs)
        latency = int((time.perf_counter_ns() - start) / 1_000_000)

        choice = response.choices[0]
        usage = response.usage

        # Extract tool calls from response
        tool_calls_data = []
        if hasattr(choice.message, 'tool_calls') and choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls_data.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                })

        return LLMResponse(
            content=choice.message.content or "",
            model=model,
            provider=self.provider_name,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
            finish_reason=choice.finish_reason or "",
            raw_response=response.model_dump() if hasattr(response, "model_dump") else {},
            latency_ms=latency,
            tool_calls=tool_calls_data,
        )

    async def generate_stream(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        model = model or self.default_model
        stream = await self._client.chat.completions.create(
            model=model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            stop=stop,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content

    async def check_health(self) -> bool:
        try:
            await self._client.models.list()
            return True
        except Exception as exc:
            logger.warning("OpenAI health check failed: %s", exc)
            return False


# ---------------------------------------------------------------------------
# Ollama Provider (OpenAI-compatible endpoint)
# ---------------------------------------------------------------------------

class OllamaProvider(LLMProvider):
    """
    Local Ollama provider using the OpenAI-compatible API.

    Ollama exposes an OpenAI-compatible Chat Completions endpoint at
    ``http://localhost:11434/v1/``.  This lets us reuse the OpenAI client
    with zero additional dependencies.

    Popular models: llama3.2, llama3.1, mistral, codellama, deepseek-coder,
                    phi3, gemma2, qwen2.5-coder
    """

    provider_name = ProviderName.OLLAMA.value

    def __init__(
        self,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise ImportError("Install openai: pip install openai")

        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.default_model = default_model or os.getenv("DEFAULT_OLLAMA_MODEL", "llama3.2")
        # Ollama requires an api_key parameter but ignores it
        api_key = api_key or os.getenv("OLLAMA_API_KEY", "ollama")

        self._client = AsyncOpenAI(
            base_url=f"{self.base_url.rstrip('/')}/v1",
            api_key=api_key,
        )

    async def generate(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict[str, Any]] = None,
        stop: Optional[list[str]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        model = model or self.default_model
        start = time.perf_counter_ns()

        api_messages = []
        for m in messages:
            msg: dict[str, Any] = {"role": m.role, "content": m.content}
            if m.tool_calls:
                msg["tool_calls"] = m.tool_calls
            if m.tool_call_id:
                msg["tool_call_id"] = m.tool_call_id
            api_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": api_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format
        if stop:
            kwargs["stop"] = stop
        if tools:
            kwargs["tools"] = tools

        response = await self._client.chat.completions.create(**kwargs)
        latency = int((time.perf_counter_ns() - start) / 1_000_000)

        choice = response.choices[0]
        usage = response.usage

        tool_calls_data = []
        if hasattr(choice.message, 'tool_calls') and choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls_data.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                })

        return LLMResponse(
            content=choice.message.content or "",
            model=model,
            provider=self.provider_name,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
            finish_reason=choice.finish_reason or "",
            raw_response=response.model_dump() if hasattr(response, "model_dump") else {},
            latency_ms=latency,
            cost_estimate_usd=0.0,
            tool_calls=tool_calls_data,
        )

    async def generate_stream(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        model = model or self.default_model
        stream = await self._client.chat.completions.create(
            model=model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            stop=stop,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content

    async def check_health(self) -> bool:
        """Ping the Ollama server to verify it's running."""
        try:
            await self._client.models.list()
            return True
        except Exception as exc:
            logger.warning("Ollama health check failed (is Ollama running?): %s", exc)
            return False

    async def list_local_models(self) -> list[str]:
        """Return names of models available in Ollama."""
        try:
            models = await self._client.models.list()
            return [m.id for m in models.data]
        except Exception as exc:
            logger.warning("Failed to list Ollama models: %s", exc)
            return []


# ---------------------------------------------------------------------------
# Anthropic Provider
# ---------------------------------------------------------------------------

class AnthropicProvider(LLMProvider):
    """Anthropic API provider (Claude Sonnet, Opus, Haiku, …)."""

    provider_name = ProviderName.ANTHROPIC.value

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
    ):
        try:
            from anthropic import AsyncAnthropic
        except ImportError:
            raise ImportError("Install anthropic: pip install anthropic")

        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self.default_model = default_model or os.getenv(
            "DEFAULT_ANTHROPIC_MODEL", "claude-sonnet-4-20250514"
        )
        self._client = AsyncAnthropic(api_key=self.api_key)

    async def generate(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict[str, Any]] = None,
        stop: Optional[list[str]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        model = model or self.default_model
        start = time.perf_counter_ns()

        # Anthropic uses a separate system parameter
        system_msg = ""
        chat_msgs: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "system":
                system_msg = m.content
            elif m.role == "tool":
                # Anthropic tool results are user messages with tool_result content
                chat_msgs.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": m.tool_call_id or "",
                        "content": m.content,
                    }],
                })
            else:
                chat_msgs.append({"role": m.role, "content": m.content})

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": chat_msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_msg:
            kwargs["system"] = system_msg
        if stop:
            kwargs["stop_sequences"] = stop
        if tools:
            # Convert OpenAI tool format to Anthropic format
            anthropic_tools = []
            for t in tools:
                func = t.get("function", t)
                params = func.get("parameters", {})
                anthropic_tools.append({
                    "name": func.get("name", ""),
                    "description": func.get("description", ""),
                    "input_schema": params,
                })
            kwargs["tools"] = anthropic_tools

        response = await self._client.messages.create(**kwargs)
        latency = int((time.perf_counter_ns() - start) / 1_000_000)

        content = ""
        tool_calls_data = []
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text
            elif hasattr(block, "type") and block.type == "tool_use":
                tool_calls_data.append({
                    "id": block.id,
                    "type": "function",
                    "function": {
                        "name": block.name,
                        "arguments": json.dumps(block.input) if isinstance(block.input, dict) else block.input,
                    },
                })

        return LLMResponse(
            content=content,
            model=model,
            provider=self.provider_name,
            prompt_tokens=response.usage.input_tokens if response.usage else 0,
            completion_tokens=response.usage.output_tokens if response.usage else 0,
            total_tokens=(
                (response.usage.input_tokens + response.usage.output_tokens)
                if response.usage
                else 0
            ),
            finish_reason=response.stop_reason or "",
            raw_response=response.model_dump() if hasattr(response, "model_dump") else {},
            latency_ms=latency,
            tool_calls=tool_calls_data,
        )

    async def generate_stream(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        model = model or self.default_model

        system_msg = ""
        chat_msgs: list[dict[str, str]] = []
        for m in messages:
            if m.role == "system":
                system_msg = m.content
            else:
                chat_msgs.append({"role": m.role, "content": m.content})

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": chat_msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_msg:
            kwargs["system"] = system_msg
        if stop:
            kwargs["stop_sequences"] = stop

        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def check_health(self) -> bool:
        try:
            # Light-weight call
            await self._client.messages.create(
                model=self.default_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True
        except Exception as exc:
            logger.warning("Anthropic health check failed: %s", exc)
            return False


# ---------------------------------------------------------------------------
# Google (Gemini) Provider
# ---------------------------------------------------------------------------

class GoogleProvider(LLMProvider):
    """Google Gemini API provider."""

    provider_name = ProviderName.GOOGLE.value

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
    ):
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("Install google-generativeai: pip install google-generativeai")

        self.api_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        self.default_model = default_model or os.getenv(
            "DEFAULT_GOOGLE_MODEL", "gemini-2.0-flash"
        )
        genai.configure(api_key=self.api_key)
        self._genai = genai

    async def generate(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict[str, Any]] = None,
        stop: Optional[list[str]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> LLMResponse:
        model_name = model or self.default_model
        start = time.perf_counter_ns()

        gen_model = self._genai.GenerativeModel(model_name)

        # Build conversation parts
        system_instruction = ""
        parts: list[dict[str, str]] = []
        for m in messages:
            if m.role == "system":
                system_instruction = m.content
            elif m.role == "user":
                parts.append({"role": "user", "parts": [m.content]})
            elif m.role == "assistant":
                parts.append({"role": "model", "parts": [m.content]})

        generation_config = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        if stop:
            generation_config["stop_sequences"] = stop

        if system_instruction:
            gen_model = self._genai.GenerativeModel(
                model_name, system_instruction=system_instruction
            )

        response = await gen_model.generate_content_async(
            parts,
            generation_config=generation_config,
        )
        latency = int((time.perf_counter_ns() - start) / 1_000_000)

        content = response.text if response.text else ""
        usage_meta = getattr(response, "usage_metadata", None)

        return LLMResponse(
            content=content,
            model=model_name,
            provider=self.provider_name,
            prompt_tokens=getattr(usage_meta, "prompt_token_count", 0),
            completion_tokens=getattr(usage_meta, "candidates_token_count", 0),
            total_tokens=getattr(usage_meta, "total_token_count", 0),
            finish_reason="stop",
            latency_ms=latency,
        )

    async def generate_stream(
        self,
        messages: list[Message],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        model_name = model or self.default_model

        system_instruction = ""
        parts: list[dict[str, str]] = []
        for m in messages:
            if m.role == "system":
                system_instruction = m.content
            elif m.role == "user":
                parts.append({"role": "user", "parts": [m.content]})
            elif m.role == "assistant":
                parts.append({"role": "model", "parts": [m.content]})

        generation_config = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        if stop:
            generation_config["stop_sequences"] = stop

        gen_model = self._genai.GenerativeModel(
            model_name,
            system_instruction=system_instruction if system_instruction else None,
        )

        response = await gen_model.generate_content_async(
            parts,
            generation_config=generation_config,
            stream=True,
        )
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    async def check_health(self) -> bool:
        try:
            model = self._genai.GenerativeModel(self.default_model)
            await model.generate_content_async(
                "hi",
                generation_config={"max_output_tokens": 1},
            )
            return True
        except Exception as exc:
            logger.warning("Google health check failed: %s", exc)
            return False


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_provider(
    provider_name: str | ProviderName,
    *,
    api_key: Optional[str] = None,
    default_model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> LLMProvider:
    """
    Factory to instantiate an LLM provider by name.

    Examples:
        provider = create_provider("ollama")
        provider = create_provider("ollama", default_model="codellama")
        provider = create_provider("openai", api_key="sk-...")
    """
    name = provider_name.value if isinstance(provider_name, ProviderName) else provider_name.lower()

    if name == ProviderName.OPENAI.value:
        return OpenAIProvider(api_key=api_key, default_model=default_model, base_url=base_url)
    elif name == ProviderName.ANTHROPIC.value:
        return AnthropicProvider(api_key=api_key, default_model=default_model)
    elif name == ProviderName.GOOGLE.value:
        return GoogleProvider(api_key=api_key, default_model=default_model)
    elif name == ProviderName.OLLAMA.value:
        return OllamaProvider(
            base_url=base_url,
            default_model=default_model,
            api_key=api_key,
        )
    else:
        raise ValueError(
            f"Unknown provider '{name}'. "
            f"Supported: {[p.value for p in ProviderName]}"
        )
