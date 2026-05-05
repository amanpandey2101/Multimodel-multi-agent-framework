"""
Proxy Router — routes frontend requests to dynamically spawned agent dev servers.
"""

from __future__ import annotations

import logging
import re
import httpx
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

logger = logging.getLogger(__name__)

router = APIRouter()

# Use a global client to reuse connection pools
client = httpx.AsyncClient()


def _rewrite_vite_asset_paths(text: str, port: int) -> str:
    proxy_prefix = f"/api/proxy/{port}"
    path_prefixes = ("@vite", "@react-refresh", "@id", "src", "node_modules")

    for asset_prefix in path_prefixes:
        text = text.replace(f'"/{asset_prefix}', f'"{proxy_prefix}/{asset_prefix}')
        text = text.replace(f"'/{asset_prefix}", f"'{proxy_prefix}/{asset_prefix}")

    # Handle CSS url(/...) patterns that may not be caught by the simple replacements above.
    text = re.sub(
        rf'url\((["\']?)/({"|".join(re.escape(prefix) for prefix in path_prefixes)})',
        rf'url(\1{proxy_prefix}/\2',
        text,
    )
    return text


@router.api_route("/{port}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_to_port(port: int, path: str, request: Request):
    """
    Proxy requests to a locally running port (e.g. an agent's dev server).
    Example: /api/proxy/3001/api/users -> http://127.0.0.1:3001/api/users
    """
    # Only allow ports > 1024 for safety, and prevent proxying to standard backend ports (e.g., 8000)
    if port < 1024 or port == 8000:
        raise HTTPException(status_code=403, detail="Port not allowed for proxying")

    target_url = f"http://127.0.0.1:{port}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    try:
        # Extract headers (filter out Host header so httpx sets it correctly for the target)
        headers = {}
        for k, v in request.headers.items():
            if k.lower() not in ("host", "content-length"):
                headers[k] = v

        # Read the body
        body = await request.body()

        # Send request
        async with httpx.AsyncClient() as client_local:
            resp = await client_local.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                follow_redirects=True
            )

        content = resp.content
        resp_headers = dict(resp.headers)

        # httpx headers are case-insensitive, but once copied into a plain dict
        # we need to handle the common lowercase form explicitly.
        content_type = (
            resp.headers.get("content-type")
            or resp.headers.get("Content-Type")
            or resp_headers.get("content-type")
            or resp_headers.get("Content-Type")
            or ""
        ).lower()

        # Rewrite HTML and JS module responses so Vite asset URLs stay under the proxy prefix.
        if any(token in content_type for token in ("text/html", "javascript", "ecmascript", "text/css")):
            text = content.decode("utf-8", errors="ignore")

            if "text/html" in content_type:
                # Inject base tag
                base_tag = f'<base href="/api/proxy/{port}/">'
                if "<head>" in text:
                    text = text.replace("<head>", f"<head>{base_tag}")
                else:
                    text = text.replace("<html>", f"<html><head>{base_tag}</head>")

            text = _rewrite_vite_asset_paths(text, port)
            content = text.encode("utf-8")
            if "content-length" in resp_headers:
                resp_headers["content-length"] = str(len(content))
            else:
                resp_headers["Content-Length"] = str(len(content))

        return Response(
            content=content,
            status_code=resp.status_code,
            headers=resp_headers
        )

    except httpx.RequestError as exc:
        logger.error(f"Proxy error to {target_url}: {exc}")
        raise HTTPException(status_code=502, detail="Bad Gateway: Target server is not reachable")
