import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
TODAY = date.fromisoformat(os.getenv("DEMO_TODAY", "2026-11-07"))
WEB_ORIGINS = [o for o in os.getenv("WEB_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o]

SUPABASE_ON = bool(SUPABASE_URL and SUPABASE_ANON_KEY)
AI_ON = bool(GEMINI_API_KEY)
