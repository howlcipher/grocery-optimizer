import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status


class SlidingWindowRateLimiter:
    """Thread-safe, in-memory sliding-window rate limiter by client IP.

    Ensures anonymous public contribution endpoints cannot be abused or flooded,
    while keeping ordinary shopping and receipt-assisted workflows completely frictionless.
    """

    def __init__(self, requests_limit: int = 60, window_seconds: int = 60, name: str = "default"):
        self.limit = requests_limit
        self.window = window_seconds
        self.name = name
        self.requests: dict[str, list[float]] = defaultdict(list)
        self.lock = Lock()

    def check(self, key: str) -> None:
        now = time.time()
        with self.lock:
            cutoff = now - self.window
            timestamps = [t for t in self.requests[key] if t > cutoff]
            if len(timestamps) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Contribution rate limit exceeded for {self.name}. Please wait {self.window} seconds before submitting again.",
                    headers={"Retry-After": str(self.window)},
                )
            timestamps.append(now)
            self.requests[key] = timestamps

    def reset(self) -> None:
        """Reset internal rate limit tracking (primarily for deterministic tests)."""
        with self.lock:
            self.requests.clear()


# Global limiter instances with proportionate limits
observation_limiter = SlidingWindowRateLimiter(requests_limit=60, window_seconds=60, name="single-observations")
batch_limiter = SlidingWindowRateLimiter(requests_limit=20, window_seconds=60, name="batch-observations")


def rate_limit_observations(request: Request) -> None:
    client_ip = request.client.host if request.client else "127.0.0.1"
    observation_limiter.check(client_ip)


def rate_limit_batch_observations(request: Request) -> None:
    client_ip = request.client.host if request.client else "127.0.0.1"
    batch_limiter.check(client_ip)
