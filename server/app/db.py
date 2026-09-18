"""asyncpg pool. The migration runner lands in T3."""

import asyncpg


async def create_pool(dsn: str) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10, command_timeout=30)
    assert pool is not None
    return pool
