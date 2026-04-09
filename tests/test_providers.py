"""
Unit tests for the LLM provider abstraction.
Tests cover provider creation, message formatting, and the Ollama provider specifically.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from agents.base.llm_provider import (
    LLMProvider,
    LLMResponse,
    Message,
    ProviderName,
    OpenAIProvider,
    OllamaProvider,
    create_provider,
)


class TestCreateProvider:
    """Tests for the provider factory."""

    def test_create_openai_provider(self):
        provider = create_provider("openai", api_key="test-key")
        assert isinstance(provider, OpenAIProvider)
        assert provider.provider_name == "openai"

    def test_create_ollama_provider(self):
        provider = create_provider("ollama")
        assert isinstance(provider, OllamaProvider)
        assert provider.provider_name == "ollama"

    def test_create_ollama_with_custom_model(self):
        provider = create_provider("ollama", default_model="codellama")
        assert isinstance(provider, OllamaProvider)
        assert provider.default_model == "codellama"

    def test_create_ollama_with_custom_url(self):
        provider = create_provider("ollama", base_url="http://gpu-server:11434")
        assert isinstance(provider, OllamaProvider)
        assert provider.base_url == "http://gpu-server:11434"

    def test_create_provider_enum(self):
        provider = create_provider(ProviderName.OLLAMA)
        assert isinstance(provider, OllamaProvider)

    def test_unknown_provider_raises(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            create_provider("nonexistent")

    def test_provider_names_enum(self):
        assert ProviderName.OPENAI.value == "openai"
        assert ProviderName.ANTHROPIC.value == "anthropic"
        assert ProviderName.GOOGLE.value == "google"
        assert ProviderName.OLLAMA.value == "ollama"


class TestLLMResponse:
    """Tests for the LLMResponse dataclass."""

    def test_response_defaults(self):
        resp = LLMResponse(content="hello", model="gpt-4o", provider="openai")
        assert resp.prompt_tokens == 0
        assert resp.completion_tokens == 0
        assert resp.cost_estimate_usd == 0.0

    def test_ollama_response_free(self):
        resp = LLMResponse(
            content="hello",
            model="llama3.2",
            provider="ollama",
            cost_estimate_usd=0.0,
        )
        assert resp.cost_estimate_usd == 0.0


class TestMessage:
    """Tests for the Message dataclass."""

    def test_message_creation(self):
        msg = Message(role="system", content="You are an assistant")
        assert msg.role == "system"
        assert msg.content == "You are an assistant"

    def test_message_roles(self):
        for role in ["system", "user", "assistant"]:
            msg = Message(role=role, content="test")
            assert msg.role == role


class TestOllamaProvider:
    """Tests specific to the Ollama provider."""

    def test_default_base_url(self):
        provider = OllamaProvider()
        assert "localhost:11434" in provider.base_url

    def test_default_model(self):
        provider = OllamaProvider()
        assert provider.default_model  # not empty

    def test_custom_configuration(self):
        provider = OllamaProvider(
            base_url="http://192.168.1.100:11434",
            default_model="mistral",
            api_key="custom-key",
        )
        assert provider.base_url == "http://192.168.1.100:11434"
        assert provider.default_model == "mistral"
