from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.repositories.transactions_repository import TransactionsRepository


@pytest.mark.asyncio
async def test_item_delete_fails_closed_when_ownership_lookup_fails():
    repo = TransactionsRepository.__new__(TransactionsRepository)
    repo.prisma = SimpleNamespace(
        transaction=SimpleNamespace(find_first=AsyncMock(side_effect=RuntimeError("database unavailable"))),
        transactionitem=SimpleNamespace(delete_many=AsyncMock()),
    )
    repo.db = Mock()

    with pytest.raises(RuntimeError, match="database unavailable"):
        await repo.delete_transaction_items("tx", "family")

    repo.prisma.transactionitem.delete_many.assert_not_awaited()
    repo.db.table.assert_not_called()


@pytest.mark.asyncio
async def test_item_delete_rejects_another_family():
    repo = TransactionsRepository.__new__(TransactionsRepository)
    repo.prisma = SimpleNamespace(
        transaction=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        transactionitem=SimpleNamespace(delete_many=AsyncMock()),
    )
    repo.db = Mock()

    assert await repo.delete_transaction_items("tx", "other-family") is False
    repo.prisma.transactionitem.delete_many.assert_not_awaited()
    repo.db.table.assert_not_called()
