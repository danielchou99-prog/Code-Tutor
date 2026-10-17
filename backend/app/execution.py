"""Shared admission control for endpoints that run code in the isolated compiler."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi.concurrency import run_in_threadpool

from .protection import ExecutionGate


class ExecutionQueueFull(RuntimeError):
    """The waiting queue has no free place."""


class ExecutionQueueTimeout(RuntimeError):
    """The request waited for an execution slot but none became free in time."""


@asynccontextmanager
async def execution_slot(gate: ExecutionGate) -> AsyncIterator[None]:
    """Reserve a queue place and an execution slot; always release both."""
    if not gate.try_enter():
        raise ExecutionQueueFull()
    has_execution_slot = False
    try:
        has_execution_slot = await run_in_threadpool(gate.wait_for_execution)
        if not has_execution_slot:
            raise ExecutionQueueTimeout()
        yield
    finally:
        if has_execution_slot:
            gate.leave_execution()
        gate.leave()
