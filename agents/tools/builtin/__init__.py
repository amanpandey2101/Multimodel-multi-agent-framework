"""
Built-in tools for the multi-agent framework.

Tools:
    - bash:        Execute shell commands
    - file_read:   Read file contents
    - file_write:  Write / create files
    - file_edit:   Edit files by string replacement
    - grep:        Search file contents with regex
    - web_search:  Search the web (placeholder)
    - web_fetch:   Fetch URL content
"""

from agents.tools.registry import ToolRegistry
from agents.tools.builtin.bash_tool import bash_tool
from agents.tools.builtin.file_read_tool import file_read_tool
from agents.tools.builtin.file_write_tool import file_write_tool
from agents.tools.builtin.file_edit_tool import file_edit_tool
from agents.tools.builtin.grep_tool import grep_tool
from agents.tools.builtin.web_fetch_tool import web_fetch_tool


def register_builtin_tools(registry: ToolRegistry) -> None:
    """Register all built-in tools with the given registry."""
    for tool in [
        bash_tool,
        file_read_tool,
        file_write_tool,
        file_edit_tool,
        grep_tool,
        web_fetch_tool,
    ]:
        registry.register(tool)
