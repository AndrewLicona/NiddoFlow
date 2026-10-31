"""Pruebas de la corrección de la categoría de los productos de una factura.

Cubre el flujo que faltaba: el OCR propone, el usuario corrige, y la
corrección queda guardada sin perder nada del resto.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.transactions_service import TransactionsService  # noqa: E402


class FakeProfileResult:
    def __init__(self, data):
        self.data = data


class FakeRepository:
    def __init__(self, transaction=None, items=None, categories=None):
        self.transaction = transaction
        self.items = items or []
        self.categories = categories or []
        self.updates = []

    def get_user_profile(self, user_id):
        return FakeProfileResult([{"family_id": "fam-1"}])

    async def get_user_profile(self, user_id):
        return FakeProfileResult([{"family_id": "fam-1"}])

    async def get_transaction_by_id(self, tx_id):
        return FakeProfileResult([self.transaction] if self.transaction else [])

    def get_categories(self, family_id=None):
        return FakeProfileResult(self.categories)

    async def get_transaction_items(self, transaction_id):
        return list(self.items)

    async def update_transaction_item(self, item_id, data):
        self.updates.append((item_id, data))
        return {"id": item_id, **data}


@pytest.fixture
def service():
    repo = FakeRepository(
        transaction={
            "id": "tx-1",
            "family_id": "fam-1",
            "description": "Compra",
            "amount": 50000.0,
            "type": "expense",
            "date": "2026-10-20T10:00:00",
        },
        items=[
            {"id": "item-1", "item_name": "Leche entera 1L", "quantity": 2.0,
             "unit_price": 4200.0, "total_price": 8400.0, "category": None,
             "category_id": None},
            {"id": "item-2", "item_name": "Detergente", "quantity": 1.0,
             "unit_price": 22000.0, "total_price": 22000.0, "category": None,
             "category_id": None},
        ],
        categories=[
            {"id": "cat-1", "name": "Alimentación", "type": "expense"},
            {"id": "cat-2", "name": "Hogar", "type": "expense"},
        ],
    )
    return TransactionsService(repo), repo


class TestUpdateItemsCategories:
    @pytest.mark.asyncio
    async def test_corrige_la_categoria_de_un_producto(self, service):
        svc, repo = service
        result = await svc.update_items_categories(
            "user-A", "tx-1",
            [{"item_id": "item-1", "category_id": "cat-1", "category": "Alimentación"}],
        )
        assert len(result) == 1
        assert result[0]["id"] == "item-1"
        assert result[0]["category_id"] == "cat-1"
        assert result[0]["updated"] is True
        assert repo.updates == [("item-1", {"category_id": "cat-1", "category": "Alimentación"})]

    @pytest.mark.asyncio
    async def test_rechaza_una_categoria_que_no_es_visible(self, service):
        """Una categoría de otra familia no está en la lista visible: se rechaza."""
        svc, repo = service
        result = await svc.update_items_categories(
            "user-A", "tx-1",
            [{"item_id": "item-1", "category_id": "cat-otra", "category": "Otra familia"}],
        )
        assert result[0]["category_id"] is None
        # No se escribe nada: la categoría no era válida.
        assert repo.updates == []

    @pytest.mark.asyncio
    async def test_ignora_un_producto_inexistente(self, service):
        svc, repo = service
        result = await svc.update_items_categories(
            "user-A", "tx-1",
            [{"item_id": "item-fantasma", "category_id": "cat-1", "category": "Alimentación"}],
        )
        assert result[0]["updated"] is False
        assert repo.updates == []

    @pytest.mark.asyncio
    async def test_rechaza_una_transaccion_de_otra_familia(self, service):
        svc, repo = service
        repo.transaction["family_id"] = "otra-familia"
        with pytest.raises(Exception):
            await svc.update_items_categories(
                "user-A", "tx-1",
                [{"item_id": "item-1", "category_id": "cat-1", "category": "Alimentación"}],
            )
        assert repo.updates == []

    @pytest.mark.asyncio
    async def test_no_reescribe_si_la_categoria_no_cambio(self, service):
        svc, repo = service
        repo.items[0]["category_id"] = "cat-1"
        result = await svc.update_items_categories(
            "user-A", "tx-1",
            [{"item_id": "item-1", "category_id": "cat-1", "category": "Alimentación"}],
        )
        assert result[0]["updated"] is False
        assert repo.updates == []

    @pytest.mark.asyncio
    async def test_puede_quitar_la_categoria(self, service):
        svc, repo = service
        repo.items[0]["category_id"] = "cat-1"
        result = await svc.update_items_categories(
            "user-A", "tx-1",
            [{"item_id": "item-1", "category_id": None, "category": None}],
        )
        assert result[0]["category_id"] is None
        assert result[0]["updated"] is True
