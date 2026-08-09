from __future__ import annotations

from collections import deque
from collections.abc import Callable
from math import ceil
from threading import BoundedSemaphore, Lock
import time


class RateLimitExceeded(RuntimeError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many compiler requests.")
        self.retry_after_seconds = retry_after_seconds


class InMemoryRateLimiter:
    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_requests < 1 or window_seconds < 1:
            raise ValueError("Rate limit values must be positive.")
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._requests: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = self._clock()
        cutoff = now - self.window_seconds

        with self._lock:
            requests = self._requests.setdefault(key, deque())
            while requests and requests[0] <= cutoff:
                requests.popleft()

            if len(requests) >= self.max_requests:
                retry_after = max(1, ceil(requests[0] + self.window_seconds - now))
                raise RateLimitExceeded(retry_after)

            requests.append(now)


class ExecutionGate:
    def __init__(
        self,
        max_concurrent: int,
        max_queued: int,
        wait_timeout_seconds: float,
    ) -> None:
        if max_concurrent < 1 or max_queued < 0 or wait_timeout_seconds <= 0:
            raise ValueError("Execution gate values are invalid.")
        self.wait_timeout_seconds = wait_timeout_seconds
        self._execution_slots = BoundedSemaphore(max_concurrent)
        self._request_slots = BoundedSemaphore(max_concurrent + max_queued)

    def try_enter(self) -> bool:
        return self._request_slots.acquire(blocking=False)

    def wait_for_execution(self) -> bool:
        return self._execution_slots.acquire(timeout=self.wait_timeout_seconds)

    def leave_execution(self) -> None:
        self._execution_slots.release()

    def leave(self) -> None:
        self._request_slots.release()

