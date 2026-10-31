"""Pruebas del servicio de importación con repositorio simulado.

Se valida la lógica de negocio sin tocar la base de datos:
normalización, detección de duplicados y la garantía de que NUNCA se borra
nada.
"""

import os
import sys
from typing import List, Optional

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.bank_import import ImportCommitRequest, ImportRow  # noqa: E402
from app.services.bank_import_service import ImportService  # noqa: E402


class FakeProfileResult:
    def __init__(self, data):
        self.data = data


class FakeRepository:
    """Repositorio simulado que registra todo lo que se le pide escribir."""

    def __init__(self, existing: Optional[List[dict]] = None):
        self.existing = existing or []
        self.inserted: List[dict] = []
        self.deleted: List[str] = []

    async def get_user_profile(self, user_id):
        return FakeProfileResult([{"family_id": "fam-1"}])

    async def get_accounts_by_family(self, family_id):
        return [
            {"id": "acc-1", "name": "Principal", "type": "personal"},
            {"id": "acc-2", "name": "Familiar", "type": "joint"},
        ]

    async def get_categories_by_family(self, family_id):
        return [
            {"id": "cat-1", "name": "Alimentación", "type": "expense"},
            {"id": "cat-2", "name": "Transporte", "type": "expense"},
        ]

    async def get_existing_movements(self, family_id, since_date):
        return self.existing

    async def insert_transaction(self, data):
        self.inserted.append(data)
        return {"id": f"new-{len(self.inserted)}"}

    async def get_transaction_by_id(self, tx_id):
        return None

    # Si algún día el servicio intentara borrar, esta llamada lo delata.
    async def delete_transaction(self, tx_id, family_id=None):
        self.deleted.append(tx_id)
        return True


CSV_SIMPLE = (
    b"Fecha,Descripcion,Monto,Comercio,Categoria\n"
    b"15/01/2026,COMPRA TARJ,45.000,CAFE AROMATICO,Alimentaci\xc3\xb3n\n"
    b"16/01/2026,PAGO NOMINA,2500000,EMPRESA XYZ,\n"
)


@pytest.fixture
def service():
    repo = FakeRepository()
    return ImportService(repo), repo


class TestPreview:
    @pytest.mark.asyncio
    async def test_no_escribe_nada(self, service):
        svc, repo = service
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert result.total == 2
        assert repo.inserted == [], "El preview jamás debe escribir en la base de datos"

    @pytest.mark.asyncio
    async def test_detecta_columnas_y_normaliza(self, service):
        svc, repo = service
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        row = result.rows[0]
        assert row.date == "2026-01-15"
        assert row.amount == 45000.0
        assert row.merchant == "Cafe Aromatico"
        assert row.type == "expense"

    @pytest.mark.asyncio
    async def test_asigna_categoria_por_nombre(self, service):
        svc, repo = service
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert result.rows[0].category_id == "cat-1"
        assert result.rows[0].category_name == "Alimentación"

    @pytest.mark.asyncio
    async def test_ingreso_detectado_por_palabra_clave(self, service):
        svc, repo = service
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert result.rows[1].type == "income"

    @pytest.mark.asyncio
    async def test_detecta_duplicado_por_huella(self, service):
        svc, repo = service
        # Se registra primero para conocer su huella
        first = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        hash_calculado = first.rows[0].import_hash

        repo.existing = [{
            "id": "tx-1", "date": "2026-01-15", "amount": 45000.0,
            "description": "COMPRA TARJ", "merchant": "Cafe Aromatico",
            "import_hash": hash_calculado, "source": "import",
        }]
        second = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert second.rows[0].status == "duplicate"
        assert second.rows[0].duplicate_of == "tx-1"
        assert second.rows[0].selected is False
        assert second.duplicate_count == 1

    @pytest.mark.asyncio
    async def test_detecta_duplicado_por_fecha_importe_comercio(self, service):
        svc, repo = service
        repo.existing = [{
            "id": "tx-9", "date": "2026-01-15T10:00:00", "amount": 45000.0,
            "description": "OTRA DESC", "merchant": "Cafe Aromatico",
            "import_hash": None, "source": "manual",
        }]
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert result.rows[0].status == "duplicate"
        assert result.rows[0].duplicate_of == "tx-9"

    @pytest.mark.asyncio
    async def test_mismo_importe_distinto_comercio_es_conflicto(self, service):
        svc, repo = service
        repo.existing = [{
            "id": "tx-8", "date": "2026-01-15T10:00:00", "amount": 45000.0,
            "description": "OTRO", "merchant": "Otro Comercio",
            "import_hash": None, "source": "manual",
        }]
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert result.rows[0].status == "conflict"
        assert result.rows[0].selected is False

    @pytest.mark.asyncio
    async def test_fila_invalida_no_se_selecciona(self, service):
        svc, repo = service
        # Descripción presente pero sin fecha ni importe: es una fila real e inválida.
        bad = b"Fecha,Descripcion,Monto\n,COMPRA SIN DATOS,\n"
        result = await svc.preview("user-1", bad, "malo.csv")
        assert result.invalid_count == 1
        assert result.rows[0].selected is False
        assert result.rows[0].status == "invalid"

    @pytest.mark.asyncio
    async def test_fila_completamente_vacia_se_ignora(self, service):
        svc, repo = service
        vacio = b"Fecha,Descripcion,Monto\n,,\n2026-01-15,ALGO,100\n"
        result = await svc.preview("user-1", vacio, "vacio.csv")
        assert result.total == 1

    @pytest.mark.asyncio
    async def test_devuelve_cuentas_y_categorias(self, service):
        svc, repo = service
        result = await svc.preview("user-1", CSV_SIMPLE, "banco.csv")
        assert len(result.accounts) == 2
        assert len(result.categories) == 2


class TestCommit:
    @pytest.mark.asyncio
    async def test_crea_solo_las_seleccionadas(self, service):
        svc, repo = service
        rows = [
            ImportRow(row_number=2, date="2026-01-15", description="Cafe",
                      merchant="Cafe", amount=45000.0, type="expense",
                      category_id="cat-1", account_id="acc-1",
                      import_hash="h1", status="new", selected=True),
            ImportRow(row_number=3, date="2026-01-16", description="Nomina",
                      merchant="Empresa Xyz", amount=2500000.0, type="income",
                      account_id="acc-1", import_hash="h2", status="new", selected=False),
        ]
        result = await svc.commit("user-1", ImportCommitRequest(rows=rows))
        assert result.created == 1
        assert result.skipped == 1
        assert len(repo.inserted) == 1

    @pytest.mark.asyncio
    async def test_ignora_duplicados(self, service):
        svc, repo = service
        rows = [
            ImportRow(row_number=2, date="2026-01-15", amount=45000.0,
                      status="duplicate", selected=False, account_id="acc-1"),
        ]
        result = await svc.commit("user-1", ImportCommitRequest(rows=rows))
        assert result.created == 0
        assert repo.inserted == []

    @pytest.mark.asyncio
    async def test_rechaza_cuenta_ajena(self, service):
        svc, repo = service
        rows = [
            ImportRow(row_number=2, date="2026-01-15", amount=45000.0,
                      status="new", selected=True, account_id="acc-fuera"),
        ]
        result = await svc.commit("user-1", ImportCommitRequest(rows=rows))
        assert result.created == 0
        assert result.errors
        assert repo.inserted == []

    @pytest.mark.asyncio
    async def test_usa_cuenta_por_defecto(self, service):
        svc, repo = service
        rows = [
            ImportRow(row_number=2, date="2026-01-15", amount=45000.0,
                      status="new", selected=True, account_id=None),
        ]
        result = await svc.commit(
            "user-1", ImportCommitRequest(rows=rows, default_account_id="acc-2")
        )
        assert result.created == 1
        assert repo.inserted[0]["account_id"] == "acc-2"

    @pytest.mark.asyncio
    async def test_marca_el_origen_como_import(self, service):
        svc, repo = service
        rows = [
            ImportRow(row_number=2, date="2026-01-15", amount=45000.0,
                      status="new", selected=True, account_id="acc-1"),
        ]
        await svc.commit("user-1", ImportCommitRequest(rows=rows))
        assert repo.inserted[0]["source"] == "import"

    @pytest.mark.asyncio
    async def test_nunca_borra_nada(self, service):
        svc, repo = service
        rows = [
            ImportRow(row_number=2, date="2026-01-15", amount=45000.0,
                      status="new", selected=True, account_id="acc-1"),
        ]
        await svc.commit("user-1", ImportCommitRequest(rows=rows))
        assert repo.deleted == [], "El importador jamás debe borrar movimientos"

    @pytest.mark.asyncio
    async def test_reporta_lo_que_falta_en_el_banco_sin_borrar(self, service):
        svc, repo = service
        repo.existing = [{
            "id": "tx-1", "date": "2026-01-15", "amount": 999.0,
            "description": "Movimiento viejo", "merchant": "X",
            "import_hash": "hash-viejo", "source": "import",
        }]
        rows = [
            ImportRow(row_number=2, date="2026-01-20", amount=100.0,
                      status="new", selected=True, account_id="acc-1"),
        ]
        result = await svc.commit("user-1", ImportCommitRequest(rows=rows))
        assert result.missing_in_bank
        assert result.missing_in_bank[0]["id"] == "tx-1"
        assert repo.deleted == []
