"""Redis cache for ephemeris results and WebSocket pub/sub."""

import json
from typing import Any

import redis.asyncio as aioredis

from app.config import settings

_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _pool


async def cache_get(key: str) -> Any | None:
    r = get_redis()
    raw = await r.get(key)
    if raw is None:
        return None
    return json.loads(raw)


async def cache_set(key: str, value: Any, ttl_s: int = 3600) -> None:
    r = get_redis()
    await r.setex(key, ttl_s, json.dumps(value))


async def cache_delete(key: str) -> None:
    r = get_redis()
    await r.delete(key)


def ephemeris_key(norad_id: int, start_iso: str, duration_s: float,
                  step_s: float, propagator: str) -> str:
    return f"ephem:{norad_id}:{start_iso}:{duration_s}:{step_s}:{propagator}"
