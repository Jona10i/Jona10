"""API-key authentication and Redis-backed rate limiting middleware."""

from __future__ import annotations

import os
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware


PUBLIC_PATHS = {"/", "/health", "/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc"}


class SecurityMiddleware(BaseHTTPMiddleware):
    """Optionally authenticate requests and enforce a Redis rate limit."""

    def __init__(self, app, redis_url: str | None = None):
        super().__init__(app)
        self.api_key = os.getenv("API_AUTH_KEY", "").strip()
        self.limit = max(0, int(os.getenv("RATE_LIMIT_PER_MINUTE", "120")))
        self.redis: Redis | None = Redis.from_url(
            redis_url or os.getenv("REDIS_URL", "redis://redis:6379/0"),
            decode_responses=True,
        )

    async def dispatch(self, request: Request, call_next: Callable):
        if request.url.path not in PUBLIC_PATHS:
            if self.api_key:
                supplied = request.headers.get("X-API-Key", "")
                authorization = request.headers.get("Authorization", "")
                if not supplied and authorization.lower().startswith("bearer "):
                    supplied = authorization[7:].strip()
                if supplied != self.api_key:
                    return JSONResponse(
                        {"detail": "Missing or invalid API key"},
                        status_code=401,
                        headers={"WWW-Authenticate": "Bearer"},
                    )

            if self.limit:
                client_ip = request.client.host if request.client else "unknown"
                bucket = f"netpulse:rate:{client_ip}"
                try:
                    count = await self.redis.incr(bucket)
                    if count == 1:
                        await self.redis.expire(bucket, 60)
                    if count > self.limit:
                        return JSONResponse(
                            {"detail": "Rate limit exceeded"},
                            status_code=429,
                            headers={"Retry-After": "60"},
                        )
                except Exception:
                    # Redis failure must not make the monitoring API unavailable.
                    pass

        return await call_next(request)

    async def close(self):
        if self.redis:
            await self.redis.aclose()
