"""Auth schemas — kept minimal since Supabase handles the heavy lifting."""

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str = ""
