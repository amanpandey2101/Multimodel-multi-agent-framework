"""
Web Fetch Tool — fetch URL content and convert to text.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from agents.tools.registry import ToolDefinition, ToolResult, ToolContext


class WebFetchInput(BaseModel):
    """Input schema for the web_fetch tool."""
    url: str = Field(description="The URL to fetch content from.")
    max_length: int = Field(default=20000, description="Maximum number of characters to return.")


def _html_to_text(html: str) -> str:
    """Simple HTML to text conversion (no external deps)."""
    # Remove script and style tags
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.IGNORECASE)
    # Convert common tags to text
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|h[1-6]|li|tr)>", "\n", text, flags=re.IGNORECASE)
    # Remove remaining tags
    text = re.sub(r"<[^>]+>", "", text)
    # Decode common HTML entities
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    text = text.replace("&nbsp;", " ")
    # Collapse whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


async def web_fetch_execute(input_data: dict[str, Any], context: ToolContext) -> ToolResult:
    """Fetch URL content and return as text."""
    url = input_data["url"]
    max_length = input_data.get("max_length", 20000)

    try:
        import urllib.request
        import urllib.error

        req = urllib.request.Request(
            url,
            headers={"User-Agent": "MultiAgent/1.0 (Python)"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            raw = response.read()

            # Detect encoding
            encoding = "utf-8"
            if "charset=" in content_type:
                encoding = content_type.split("charset=")[-1].split(";")[0].strip()

            text = raw.decode(encoding, errors="replace")

            # Convert HTML to text
            if "html" in content_type.lower():
                text = _html_to_text(text)

            if len(text) > max_length:
                text = text[:max_length] + "\n\n... (truncated)"

            return ToolResult(data=f"Content from {url}:\n\n{text}")

    except urllib.error.HTTPError as exc:
        return ToolResult(data=f"HTTP Error {exc.code}: {exc.reason}", is_error=True)
    except urllib.error.URLError as exc:
        return ToolResult(data=f"URL Error: {exc.reason}", is_error=True)
    except Exception as exc:
        return ToolResult(data=f"Fetch error: {exc}", is_error=True)


web_fetch_tool = ToolDefinition(
    name="web_fetch",
    description=(
        "Fetch content from a URL. Converts HTML to plain text. "
        "Useful for reading documentation, API references, etc."
    ),
    input_schema=WebFetchInput,
    execute=web_fetch_execute,
)
