"""
Auth router — sign up, sign in, and refresh via Supabase Auth.

The backend proxies auth requests to Supabase so the frontend
only needs to talk to one API origin.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from backend.app.supabase_client import get_supabase_auth_dependency
from supabase import Client

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register")
async def register(
    body: RegisterRequest,
    supabase: Client = Depends(get_supabase_auth_dependency),
):
    """Register a new user via Supabase Auth."""
    try:
        result = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {
                "data": {"full_name": body.full_name},
            },
        })

        if not result.user:
            raise HTTPException(status_code=400, detail="Registration failed")

        return {
            "id": str(result.user.id),
            "email": result.user.email,
            "access_token": result.session.access_token if result.session else None,
            "refresh_token": result.session.refresh_token if result.session else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(
    body: LoginRequest,
    supabase: Client = Depends(get_supabase_auth_dependency),
):
    """Sign in with email and password."""
    try:
        result = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })

        if not result.session:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
            "user": {
                "id": str(result.user.id),
                "email": result.user.email,
                "full_name": result.user.user_metadata.get("full_name", ""),
            },
        }
    except Exception as e:
        if "invalid" in str(e).lower() or "401" in str(e):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refresh")
async def refresh_token(
    body: RefreshRequest,
    supabase: Client = Depends(get_supabase_auth_dependency),
):
    """Refresh an access token."""
    try:
        result = supabase.auth.refresh_session(body.refresh_token)

        if not result.session:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))
