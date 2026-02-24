"""
Request logging middleware
"""
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests and responses with timing"""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Log request
        logger.info(
            f"Request started: {request.method} {request.url.path} | "
            f"Client: {request.client.host}"
        )

        # Process request
        response = await call_next(request)

        # Calculate process time
        process_time = time.time() - start_time

        # Log response
        logger.info(
            f"Request completed: {request.method} {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {process_time:.2f}s"
        )

        # Add custom header with process time
        response.headers["X-Process-Time"] = f"{process_time:.4f}"

        return response
