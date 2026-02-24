"""
Rate limiting middleware for API protection
"""
import time
import logging
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List

from ..core.config import settings

logger = logging.getLogger(__name__)

# In-memory rate limit storage (use Redis in production)
rate_limit_storage: Dict[str, List[datetime]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware
    Limits requests per IP address per time window
    """

    def __init__(self, app, requests_per_minute: int = None):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute or settings.RATE_LIMIT_PER_MINUTE

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/api/health"]:
            return await call_next(request)

        client_ip = request.client.host
        now = datetime.now()

        # Clean old requests (older than 1 minute)
        rate_limit_storage[client_ip] = [
            req_time for req_time in rate_limit_storage[client_ip]
            if now - req_time < timedelta(minutes=1)
        ]

        # Check rate limit
        if len(rate_limit_storage[client_ip]) >= self.requests_per_minute:
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "Rate limit exceeded",
                    "limit": self.requests_per_minute,
                    "window": "1 minute",
                    "retry_after": 60
                }
            )

        # Add current request
        rate_limit_storage[client_ip].append(now)

        # Add rate limit headers
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(
            self.requests_per_minute - len(rate_limit_storage[client_ip])
        )
        response.headers["X-RateLimit-Reset"] = str(int((now + timedelta(minutes=1)).timestamp()))

        return response
