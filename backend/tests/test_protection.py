import pytest

from app.protection import ExecutionGate, InMemoryRateLimiter, RateLimitExceeded


class FakeClock:
    def __init__(self, now: float = 0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_rate_limiter_rejects_requests_over_limit() -> None:
    clock = FakeClock()
    limiter = InMemoryRateLimiter(max_requests=2, window_seconds=60, clock=clock)

    limiter.check("client-a")
    limiter.check("client-a")

    with pytest.raises(RateLimitExceeded) as error:
        limiter.check("client-a")

    assert error.value.retry_after_seconds == 60


def test_rate_limiter_separates_clients_and_resets_window() -> None:
    clock = FakeClock()
    limiter = InMemoryRateLimiter(max_requests=1, window_seconds=10, clock=clock)

    limiter.check("client-a")
    limiter.check("client-b")
    clock.now = 10
    limiter.check("client-a")


def test_execution_gate_rejects_when_active_and_queue_slots_are_full() -> None:
    gate = ExecutionGate(max_concurrent=1, max_queued=0, wait_timeout_seconds=0.01)

    assert gate.try_enter() is True
    assert gate.wait_for_execution() is True
    assert gate.try_enter() is False

    gate.leave_execution()
    gate.leave()


def test_execution_gate_times_out_waiting_for_execution() -> None:
    gate = ExecutionGate(max_concurrent=1, max_queued=1, wait_timeout_seconds=0.01)

    assert gate.try_enter() is True
    assert gate.wait_for_execution() is True
    assert gate.try_enter() is True
    assert gate.wait_for_execution() is False

    gate.leave()
    gate.leave_execution()
    gate.leave()

