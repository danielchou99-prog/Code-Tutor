import asyncio

import pytest

from app.execution import ExecutionQueueFull, ExecutionQueueTimeout, execution_slot
from app.interactive import final_interactive_status
from app.protection import ExecutionGate


def make_gate(**overrides) -> ExecutionGate:
    values = {"max_concurrent": 1, "max_queued": 1, "wait_timeout_seconds": 0.05}
    values.update(overrides)
    return ExecutionGate(**values)


def test_slot_is_released_after_normal_exit_and_after_errors() -> None:
    gate = make_gate()

    async def scenario() -> None:
        async with execution_slot(gate):
            pass
        with pytest.raises(ValueError):
            async with execution_slot(gate):
                raise ValueError("boom")
        # Both places were returned, so the gate can be entered again.
        async with execution_slot(gate):
            pass

    asyncio.run(scenario())


def test_full_queue_raises_queue_full_without_taking_a_place() -> None:
    gate = make_gate(max_concurrent=1, max_queued=0)

    async def scenario() -> None:
        async with execution_slot(gate):
            with pytest.raises(ExecutionQueueFull):
                async with execution_slot(gate):
                    pass
        async with execution_slot(gate):
            pass

    asyncio.run(scenario())


def test_waiting_too_long_raises_timeout_and_releases_the_queue_place() -> None:
    gate = make_gate(max_concurrent=1, max_queued=1)

    async def scenario() -> None:
        async with execution_slot(gate):
            with pytest.raises(ExecutionQueueTimeout):
                async with execution_slot(gate):
                    pass
        async with execution_slot(gate):
            pass

    asyncio.run(scenario())


@pytest.mark.parametrize(
    ("ready", "return_code", "expected"),
    [
        (False, 1, "compile_error"),
        (True, 0, "accepted"),
        (True, 124, "timeout"),
        (True, 137, "timeout"),
        (True, 2, "runtime_error"),
    ],
)
def test_final_interactive_status(ready: bool, return_code: int, expected: str) -> None:
    assert final_interactive_status(ready, return_code) == expected
