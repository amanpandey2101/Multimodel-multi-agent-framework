"""
Supabase client singleton for backend operations.

Uses the SERVICE_ROLE key (bypasses RLS) for server-side operations.
The ANON key is used by the frontend only.
"""

from __future__ import annotations

from functools import lru_cache
from supabase import create_client, Client
from backend.app.config import get_settings


@lru_cache()
def get_supabase() -> Client:
    """Get the Supabase client (service role — full access)."""
    settings = get_settings()
    url = settings.supabase_url
    key = settings.supabase_service_key

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
            "Check your .env file in the root directory."
        )

    return create_client(url, key)


def get_supabase_dependency() -> Client:
    """FastAPI dependency wrapper."""
    return get_supabase()


@lru_cache()
def get_supabase_auth() -> Client:
    """Get Supabase auth client using anon key for end-user auth flows."""
    settings = get_settings()
    url = settings.supabase_url
    key = settings.supabase_anon_key

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set. "
            "Check your .env file in the root directory."
        )

    return create_client(url, key)


def get_supabase_auth_dependency() -> Client:
    """FastAPI dependency wrapper for auth client."""
    return get_supabase_auth()
