"""
Auth dependencies — extract current user from Supabase JWT.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Header
from backend.app.supabase_client import get_supabase_dependency
from supabase import Client


async def get_current_user(
    authorization: str = Header(...),
    supabase: Client = Depends(get_supabase_dependency),
) -> dict:
    """
    Extract and verify the Supabase access token from the Authorization header.
    Returns the user dict from Supabase Auth.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return {
            "id": str(user_response.user.id),
            "email": user_response.user.email,
            "user_metadata": user_response.user.user_metadata or {},
        }
    except Exception as e:
        if "401" in str(e) or "invalid" in str(e).lower():
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        raise HTTPException(status_code=401, detail=str(e))
