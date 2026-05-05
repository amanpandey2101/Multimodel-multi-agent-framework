"""
Proxy Router — routes frontend requests to dynamically spawned agent dev servers.
"""

from __future__ import annotations

import logging
import httpx
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

logger = logging.getLogger(__name__)

router = APIRouter()

# Use a global client to reuse connection pools
client = httpx.AsyncClient()


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
        
        # Inject <base> tag and rewrite absolute paths for HTML responses
        if "text/html" in resp_headers.get("Content-Type", "").lower():
            html_text = content.decode("utf-8", errors="ignore")
            
            # Inject base tag
            base_tag = f'<base href="/api/proxy/{port}/">'
            if "<head>" in html_text:
                html_text = html_text.replace("<head>", f"<head>{base_tag}")
            else:
                html_text = html_text.replace("<html>", f"<html><head>{base_tag}</head>")
            
            # Rewrite common absolute paths to relative using regex
            # This covers src="/...", href="/...", and import "/..." or from "/..."
            import re
            
            # Pattern to match absolute paths starting with /, excluding the proxy path itself
            # We look for paths starting with /@vite, /src, /node_modules, /@react-refresh
            patterns = [
                (r'src="/(@vite|src|node_modules|@react-refresh)', r'src="./\1'),
                (r'href="/(@vite|src|node_modules|@react-refresh)', r'href="./\1'),
                (r'from "/(@vite|src|node_modules|@react-refresh)', r'from "./\1'),
                (r'import "/(@vite|src|node_modules|@react-refresh)', r'import "./\1'),
                (r'url\("/(@vite|src|node_modules|@react-refresh)', r'url\("./\1'),
            ]
            
            for pattern, replacement in patterns:
                html_text = re.sub(pattern, replacement, html_text)
                
            content = html_text.encode("utf-8")
            resp_headers["Content-Length"] = str(len(content))

        return Response(
            content=content,
            status_code=resp.status_code,
            headers=resp_headers
        )

    except httpx.RequestError as exc:
        logger.error(f"Proxy error to {target_url}: {exc}")
        raise HTTPException(status_code=502, detail="Bad Gateway: Target server is not reachable")
