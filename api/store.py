import json
from datetime import datetime, timezone

import httpx

import settings

_profiles: dict[str, dict] = {}
_actions: dict[str, list[dict]] = {}
_events: dict[str, list[dict]] = {}
_next_id = 0

PROFILE_FIELDS = ["job_type", "contract_type", "pay_frequency", "pay_min_gbp", "pay_max_gbp", "adults", "children_ages", "benefits", "housing", "area", "energy_payment", "guessed_by_ai"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _user_headers(user):
    return {"apikey": settings.SUPABASE_ANON_KEY, "Authorization": f"Bearer {user['token']}", "Content-Type": "application/json"}


def _service_headers():
    k = settings.SUPABASE_SERVICE_ROLE_KEY
    return {"apikey": k, "Authorization": f"Bearer {k}", "Content-Type": "application/json"}


def _rest(path):
    return f"{settings.SUPABASE_URL}/rest/v1/{path}"


async def get_profile(user):
    if not settings.SUPABASE_ON:
        return _profiles.get(user["id"])
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(_rest(f"profiles?id=eq.{user['id']}&select=*"), headers=_user_headers(user))
        r.raise_for_status()
        rows = r.json()
    return {k: rows[0].get(k) for k in PROFILE_FIELDS} if rows else None


async def save_profile(user, profile):
    row = {k: profile.get(k) for k in PROFILE_FIELDS}
    if not settings.SUPABASE_ON:
        _profiles[user["id"]] = row
        return row
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            _rest("profiles"),
            headers={**_user_headers(user), "Prefer": "resolution=merge-duplicates,return=minimal"},
            json={**row, "id": user["id"], "updated_at": _now()},
        )
        r.raise_for_status()
    return row


async def list_actions(user):
    if not settings.SUPABASE_ON:
        return list(_actions.get(user["id"], []))
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(_rest("actions?select=*&order=confirmed_at.asc"), headers=_user_headers(user))
        r.raise_for_status()
        return r.json()


async def add_action(user, warning_id, action, weekly_gbp=None):
    row = {"warning_id": warning_id, "action": action, "weekly_gbp": weekly_gbp, "confirmed_at": _now()}
    if not settings.SUPABASE_ON:
        global _next_id
        _next_id += 1
        _actions.setdefault(user["id"], []).append({**row, "id": _next_id})
        return row
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(_rest("actions"), headers={**_user_headers(user), "Prefer": "return=minimal"}, json={**row, "user_id": user["id"]})
        r.raise_for_status()
    return row


async def delete_whatif(user, action_id: int):
    if not settings.SUPABASE_ON:
        _actions[user["id"]] = [a for a in _actions.get(user["id"], []) if not (a["warning_id"] == "whatif" and a["id"] == action_id)]
        return
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.delete(_rest(f"actions?id=eq.{action_id}&warning_id=eq.whatif&user_id=eq.{user['id']}"), headers=_user_headers(user))
        r.raise_for_status()


async def clear_actions(user):
    if not settings.SUPABASE_ON:
        _actions.pop(user["id"], None)
        return
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.delete(_rest(f"actions?user_id=eq.{user['id']}"), headers=_user_headers(user))
        r.raise_for_status()


def fold_actions(rows):
    state, shocks = {}, []
    for row in rows:
        if row["warning_id"] == "whatif":
            shocks.append({**json.loads(row["action"]), "weekly_gbp": row.get("weekly_gbp"), "id": row.get("id")})
        else:
            state[row["warning_id"]] = {"confirmed": row["action"] == "yes", "weekly_gbp": row.get("weekly_gbp")}
    return state, shocks


async def log_event(user, tool, reason):
    row = {"user_id": user["id"], "tool": tool, "reason": reason, "created_at": _now()}
    _events.setdefault(user["id"], []).append(row)
    if settings.SUPABASE_ON and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post(_rest("agent_events"), headers={**_service_headers(), "Prefer": "return=minimal"}, json={k: row[k] for k in ("user_id", "tool", "reason")})
        except httpx.HTTPError:
            pass
    return row


async def list_events(user):
    if settings.SUPABASE_ON and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(_rest(f"agent_events?user_id=eq.{user['id']}&select=tool,reason,created_at&order=created_at.desc&limit=50"), headers=_service_headers())
                r.raise_for_status()
                return r.json()
        except httpx.HTTPError:
            pass
    return list(reversed(_events.get(user["id"], [])))[:50]
