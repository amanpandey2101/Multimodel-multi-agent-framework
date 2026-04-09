"""
Unit tests for the tool system: registry, executor, and built-in tools.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import pytest

from agents.tools.registry import ToolDefinition, ToolResult, ToolRegistry, ToolContext, define_tool
from agents.tools.executor import ToolExecutor
from agents.tools.builtin import register_builtin_tools
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# ToolRegistry Tests
# ---------------------------------------------------------------------------

class TestToolRegistry:
    def test_register_and_get(self):
        registry = ToolRegistry()

        class DummyInput(BaseModel):
            msg: str

        async def dummy_exec(inp, ctx):
            return ToolResult(data="ok")

        tool = define_tool(
            name="dummy", description="A test tool",
            input_schema=DummyInput, execute=dummy_exec,
        )
        registry.register(tool)

        assert registry.has("dummy")
        assert registry.get("dummy") is tool
        assert "dummy" in registry.list_names()

    def test_duplicate_raises(self):
        registry = ToolRegistry()

        class DI(BaseModel):
            x: str

        async def ex(i, c):
            return ToolResult(data="")

        tool = define_tool(name="dup", description="", input_schema=DI, execute=ex)
        registry.register(tool)

        with pytest.raises(ValueError, match="already registered"):
            registry.register(tool)

    def test_unregister(self):
        registry = ToolRegistry()

        class DI(BaseModel):
            x: str

        async def ex(i, c):
            return ToolResult(data="")

        tool = define_tool(name="rm_test", description="", input_schema=DI, execute=ex)
        registry.register(tool)
        assert registry.has("rm_test")
        registry.unregister("rm_test")
        assert not registry.has("rm_test")

    def test_to_llm_tools(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        schemas = registry.to_llm_tools()
        assert len(schemas) >= 5
        for s in schemas:
            assert "function" in s
            assert "name" in s["function"]
            assert "description" in s["function"]

    def test_builtin_count(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        assert len(registry) >= 5
        assert registry.has("bash")
        assert registry.has("file_read")
        assert registry.has("file_write")
        assert registry.has("file_edit")
        assert registry.has("grep")


# ---------------------------------------------------------------------------
# ToolExecutor Tests
# ---------------------------------------------------------------------------

class TestToolExecutor:
    @pytest.mark.asyncio
    async def test_execute_missing_tool(self):
        registry = ToolRegistry()
        executor = ToolExecutor(registry)
        result = await executor.execute("nonexistent", {})
        assert result.is_error
        assert "not found" in result.data

    @pytest.mark.asyncio
    async def test_execute_invalid_input(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)
        # bash requires 'command' field
        result = await executor.execute("bash", {"bad_field": "test"})
        assert result.is_error
        assert "validation" in result.data.lower() or "error" in result.data.lower()


# ---------------------------------------------------------------------------
# Built-in Tool Tests
# ---------------------------------------------------------------------------

class TestFileTools:
    @pytest.mark.asyncio
    async def test_file_write_and_read(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            ctx = ToolContext(workspace_dir=tmpdir)
            filepath = os.path.join(tmpdir, "test.txt")

            # Write
            result = await executor.execute("file_write", {
                "file_path": filepath,
                "content": "Hello, World!\nLine 2\n",
            }, ctx)
            assert not result.is_error
            assert "Successfully" in result.data

            # Read
            result = await executor.execute("file_read", {
                "file_path": filepath,
            }, ctx)
            assert not result.is_error
            assert "Hello, World!" in result.data
            assert "Line 2" in result.data

    @pytest.mark.asyncio
    async def test_file_edit(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            ctx = ToolContext(workspace_dir=tmpdir)
            filepath = os.path.join(tmpdir, "edit_test.txt")

            # Write initial content
            await executor.execute("file_write", {
                "file_path": filepath,
                "content": "function old_name():\n    pass\n",
            }, ctx)

            # Edit
            result = await executor.execute("file_edit", {
                "file_path": filepath,
                "old_string": "old_name",
                "new_string": "new_name",
            }, ctx)
            assert not result.is_error

            # Verify
            result = await executor.execute("file_read", {"file_path": filepath}, ctx)
            assert "new_name" in result.data
            assert "old_name" not in result.data

    @pytest.mark.asyncio
    async def test_file_read_not_found(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)
        result = await executor.execute("file_read", {
            "file_path": "/nonexistent/path/file.txt",
        })
        assert result.is_error
        assert "not found" in result.data.lower()


class TestGrepTool:
    @pytest.mark.asyncio
    async def test_grep_in_file(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            ctx = ToolContext(workspace_dir=tmpdir)
            filepath = os.path.join(tmpdir, "search.py")

            await executor.execute("file_write", {
                "file_path": filepath,
                "content": "def hello():\n    print('world')\n\ndef goodbye():\n    pass\n",
            }, ctx)

            result = await executor.execute("grep", {
                "pattern": "def \\w+",
                "path": filepath,
            }, ctx)
            assert not result.is_error
            assert "hello" in result.data
            assert "goodbye" in result.data

    @pytest.mark.asyncio
    async def test_grep_no_matches(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            ctx = ToolContext(workspace_dir=tmpdir)
            filepath = os.path.join(tmpdir, "empty.txt")

            await executor.execute("file_write", {
                "file_path": filepath, "content": "abc\n",
            }, ctx)

            result = await executor.execute("grep", {
                "pattern": "xyz_does_not_exist",
                "path": filepath,
            }, ctx)
            assert "No matches" in result.data


class TestBashTool:
    @pytest.mark.asyncio
    async def test_echo(self):
        registry = ToolRegistry()
        register_builtin_tools(registry)
        executor = ToolExecutor(registry)
        result = await executor.execute("bash", {"command": "echo hello"})
        assert not result.is_error
        assert "hello" in result.data
