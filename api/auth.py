import time

import httpx
from fastapi import Header, HTTPException

import settings

DEMO_USER = {"id": "demo-user", "email": "demo@headsup.local", "token": "demo"}
_cache: dict[str, tuple[float, dict]] = {}


async def current_user(authorization: str = Header(default="")) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Missing sign-in token")
    if not settings.SUPABASE_ON:
        if token != "demo":
            raise HTTPException(401, "Demo mode accepts only the demo token")
        return DEMO_USER
    hit = _cache.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={"apikey": settings.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Sign-in token is not valid")
    body = r.json()
    user = {"id": body["id"], "email": body.get("email"), "token": token}
    _cache[token] = (time.time() + 300, user)
    return user
