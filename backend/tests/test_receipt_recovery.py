from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.transactions_repository import TransactionsRepository


@pytest.mark.asyncio
@pytest.mark.parametrize("owned,count,expected", [(False, 0, None), (True, 2, 0), (True, 0, 1)])
async def test_recovery_only_appends_to_an_empty_owned_receipt(owned, count, expected):
    items = SimpleNamespace(count=AsyncMock(return_value=count), create_many=AsyncMock(return_value=1))
    db = SimpleNamespace(
        query_raw=AsyncMock(return_value=[{"family_id": "family"}] if owned else []),
        transactionitem=items,
    )

    @asynccontextmanager
    async def tx():
        yield db

    repo = TransactionsRepository.__new__(TransactionsRepository)
    repo.prisma = SimpleNamespace(tx=tx)
    data = [{"transaction_id": "transaction", "item_name": "Café"}]
    result = await repo.append_missing_receipt_items("user", "transaction", "receipt", data)

    assert result == expected
    if expected == 1:
        items.create_many.assert_awaited_once_with(data=data)
    else:
        items.create_many.assert_not_awaited()
