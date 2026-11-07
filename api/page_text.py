import html
import re

import httpx

HEADERS = {"User-Agent": "HeadsUp/1.0 (GreatUniHack 2026 demo; reads pages for one user)", "Accept": "text/html"}


def html_to_text(raw: str) -> str:
    m = re.search(r"<main\b.*?</main>", raw, re.S | re.I)
    body = m.group(0) if m else raw
    body = re.sub(r"<(script|style|nav|footer|header|noscript|svg)\b.*?</\1>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<(br|p|li|h[1-6]|tr|div)\b[^>]*>", "\n", body, flags=re.I)
    body = re.sub(r"<[^>]+>", " ", body)
    body = html.unescape(body)
    lines = [re.sub(r"\s+", " ", l).strip() for l in body.splitlines()]
    return "\n".join(l for l in lines if len(l) > 2)


async def fetch_page_text(url: str, limit: int = 7000) -> tuple[str | None, str]:
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True, headers=HEADERS) as c:
            r = await c.get(url)
    except httpx.HTTPError as e:
        return None, f"could not reach the page ({type(e).__name__})"
    if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
        return None, f"the page answered {r.status_code}"
    text = html_to_text(r.text)
    if len(text) < 200:
        return None, "the page had too little text"
    return text[:limit], f"read {min(len(text), limit)} characters of the page"
