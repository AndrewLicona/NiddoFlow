"""Pruebas del CRUD de categorias propias (contrato CONTRATOS_IMPLEMENTACION.md §3).

Se prueban con un repositorio falso en memoria: no tocan la base de datos.

Lo que se verifica:
  - El `family_id` sale SIEMPRE del perfil del usuario, nunca del body.
  - Las categorias por defecto y las de otra familia no se pueden tocar.
  - Los nombres duplicados se rechazan.
  - Borrar una categoria NO borra historial: solo lo desvincula y avisa.
  - Las reglas aprendidas se normalizan, son por usuario y se aplican antes
    que el matcher generico.
"""

import copy
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
except Exception:  # pragma: no cover - dotenv es opcional en tests
    pass

from app.services.categories_service import (  # noqa: E402
    CategoriesService,
    CategoryConflictError,
    CategoryNotFoundError,
    CategoryPermissionError,
    CategoryValidationError,
)

FAMILY_A = "aaaaaaaa-0000-0000-0000-000000000001"
FAMILY_B = "bbbbbbbb-0000-0000-0000-000000000002"
USER_A = "aaaaaaaa-0000-0000-0000-00000000000a"
USER_B = "bbbbbbbb-0000-0000-0000-00000000000b"

CAT_DEFAULT = "00000000-0000-0000-0000-000000000001"
CAT_A = "00000000-0000-0000-0000-0000000000a1"
CAT_B = "00000000-0000-0000-0000-0000000000b1"
CAT_A2 = "00000000-0000-0000-0000-0000000000a2"
CAT_A_INGRESO = "00000000-0000-0000-0000-0000000000c1"

CATEGORIAS = [
    {"id": CAT_DEFAULT, "name": "Alimentación", "type": "expense", "is_default": True, "family_id": None},
    {"id": CAT_A, "name": "Comida", "type": "expense", "is_default": False, "family_id": FAMILY_A},
    {"id": CAT_B, "name": "Comida", "type": "expense", "is_default": False, "family_id": FAMILY_B},
    {"id": CAT_A2, "name": "Mercado", "type": "expense", "is_default": False, "family_id": FAMILY_A},
    {"id": CAT_A_INGRESO, "name": "Salario", "type": "income", "is_default": False, "family_id": FAMILY_A},
]

FAMILIAS = {USER_A: FAMILY_A, USER_B: FAMILY_B}

# Detalle de lo que usa una categoria (mismas claves que el contrato).
# Los ids tienen forma de UUID porque asi los devuelve la base de datos.
TRANSACCIONES = [
    {"id": "11111111-1111-1111-1111-111111111111", "description": "Compra en el super",
     "amount": 45000.0, "date": "2026-10-20", "type": "expense"},
    {"id": "11111111-1111-1111-1111-111111111112", "description": "Farmacia",
     "amount": 12000.0, "date": "2026-10-18", "type": "expense"},
]

PRESUPUESTOS = [
    {"id": "22222222-2222-2222-2222-222222222222", "amount": 200000.0,
     "period": "monthly", "month": 10, "week_number": None, "year": 2026,
     "user_id": None},
]

ITEMS = [
    {"id": "33333333-3333-3333-3333-333333333333",
     "transaction_id": "11111111-1111-1111-1111-111111111111", "item_name": "Leche",
     "quantity": 2.0, "total_price": 9800.0,
     "transaction_description": "Compra en el super"},
]

DEUDAS = [
    {"id": "44444444-4444-4444-4444-444444444441",
     "description": "Prestamo del banco", "total_amount": 500000.0,
     "remaining_amount": 200000.0, "type": "to_pay", "due_date": "2026-11-01"},
    {"id": "44444444-4444-4444-4444-444444444442",
     "description": "Prestamo de un amigo", "total_amount": 100000.0,
     "remaining_amount": 100000.0, "type": "to_pay", "due_date": "2026-12-01"},
]


class Result:
    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class FakeDb:
    """Stub minimo del cliente supabase-py (cadena de llamadas encadenables)."""

    def __init__(self):
        self.llamadas = []
        # Callback que imita a la base de datos: al poner `category_id = NULL`
        # las filas dejan de apuntar a la categoria.
        self.al_desvincular = None

    def table(self, name):
        self.llamadas.append(name)
        return FakeQuery(self, name)


class FakeQuery:
    def __init__(self, db, tabla=None):
        self.db = db
        self.tabla = tabla
        self.filtros = []

    def select(self, *args, **kwargs):
        return self

    def update(self, data):
        self.db.llamadas.append(("update", data))
        if self.tabla and self.db.al_desvincular and data.get("category_id", "x") is None:
            self.db.al_desvincular(self.tabla)
        return self

    def eq(self, key, value):
        self.filtros.append((key, value))
        return self

    def execute(self):
        return Result(data=[])


class FakeCategoriesRepository:
    def __init__(self, categorias=None, reglas=None):
        # Copia profunda: cada test trabaja sobre sus propias filas y no
        # contamina a los demas.
        self.categorias = copy.deepcopy(categorias if categorias is not None else CATEGORIAS)
        self.reglas = copy.deepcopy(list(reglas or []))
        self.db = FakeDb()
        self.insertados = []
        self.actualizados = []
        self.eliminados = []
        self.transacciones_por_categoria = 0
        self.presupuestos_por_categoria = 0
        self.items_por_categoria = 0
        self.deudas_por_categoria = 0
        self.transacciones = copy.deepcopy(TRANSACCIONES)
        self.presupuestos = copy.deepcopy(PRESUPUESTOS)
        self.items = copy.deepcopy(ITEMS)
        self.deudas = copy.deepcopy(DEUDAS)
        self.reasignaciones = []
        self.puede_desvincular_presupuestos = True
        self._contador = 0
        self.db.al_desvincular = self._desvincular

    def _desvincular(self, tabla):
        """Imita a la base de datos: al poner `category_id = NULL` las filas
        dejan de apuntar a la categoria (asi el detalle se lee ANTES de
        desvincular)."""
        if tabla == "transactions":
            self.transacciones = []
        elif tabla == "budgets":
            self.presupuestos = []
        elif tabla == "transaction_items":
            self.items = []
        elif tabla == "debts":
            self.deudas = []

    # --- lectura ---------------------------------------------------------

    def get_user_profile(self, user_id):
        family_id = FAMILIAS.get(user_id)
        return Result(data=[{"family_id": family_id}] if family_id else [])

    def get_categories(self, family_id=None):
        if family_id:
            visibles = [
                c
                for c in self.categorias
                if c.get("is_default") or c.get("family_id") == family_id
            ]
        else:
            visibles = [c for c in self.categorias if c.get("is_default")]
        return Result(data=visibles)

    def get_category_by_id(self, category_id):
        found = [c for c in self.categorias if c["id"] == category_id]
        return Result(data=found)

    # --- escritura -------------------------------------------------------

    def insert_category(self, data):
        self._contador += 1
        nueva = {"id": f"nueva-{self._contador}", **data}
        self.categorias.append(nueva)
        self.insertados.append(data)
        return Result(data=[nueva])

    def update_category(self, category_id, family_id, data):
        for categoria in self.categorias:
            if categoria["id"] == category_id and categoria.get("family_id") == family_id:
                categoria.update(data)
                self.actualizados.append((category_id, data))
                return Result(data=[categoria])
        return Result(data=[])

    def delete_category(self, category_id, family_id):
        for categoria in list(self.categorias):
            if categoria["id"] == category_id and categoria.get("family_id") == family_id:
                self.categorias.remove(categoria)
                self.eliminados.append(category_id)
                return Result(data=[categoria])
        return Result(data=[])

    # --- impacto ---------------------------------------------------------

    def count_transactions_by_category(self, category_id):
        return self.transacciones_por_categoria

    def count_budgets_by_category(self, category_id):
        return self.presupuestos_por_categoria

    def count_items_by_category(self, category_id):
        return self.items_por_categoria

    def count_debts_by_category(self, category_id):
        return self.deudas_por_categoria

    def list_transactions_by_category(self, category_id, limit=50):
        return copy.deepcopy(self.transacciones[:limit])

    def list_budgets_by_category(self, category_id, limit=50):
        return copy.deepcopy(self.presupuestos[:limit])

    def list_items_by_category(self, category_id, limit=50):
        return copy.deepcopy(self.items[:limit])

    def list_debts_by_category(self, category_id, limit=50):
        return copy.deepcopy(self.deudas[:limit])

    def reassign_category(self, category_id, family_id, target_category_id):
        self.reasignaciones.append((category_id, family_id, target_category_id))
        return {
            "transactions": self.transacciones_por_categoria,
            "budgets": self.presupuestos_por_categoria,
            "items": self.items_por_categoria,
            "debts": self.deudas_por_categoria,
        }

    # --- reglas ----------------------------------------------------------

    def upsert_category_rule(self, data):
        for regla in self.reglas:
            if (
                regla["user_id"] == data["user_id"]
                and regla["merchant"] == data["merchant"]
                and regla["raw_keyword"] == data["raw_keyword"]
            ):
                regla.update(data)
                return Result(data=[regla])
        nueva = {"id": f"regla-{len(self.reglas) + 1}", **data}
        self.reglas.append(nueva)
        return Result(data=[nueva])

    def get_category_rules(self, user_id, merchant=None):
        reglas = [r for r in self.reglas if r["user_id"] == user_id]
        if merchant:
            reglas = [r for r in reglas if r["merchant"] == merchant]
        return Result(data=reglas)


def _service(repository=None):
    return CategoriesService(repository or FakeCategoriesRepository())


# --- Repositorio (cadena de llamadas de supabase-py) ----------------------

class _StubQuery:
    """Imita la cadena encadenable de supabase-py para probar el repositorio."""

    def __init__(self, db, tabla):
        self.db = db
        self.tabla = tabla
        self.filtros = []
        self.orden = []
        self.limite = None
        self.datos = None

    def select(self, *columnas, **kwargs):
        self.db.consultas.append(("select", self.tabla, list(columnas), kwargs.get("count")))
        return self

    def update(self, data):
        self.datos = data
        self.db.consultas.append(("update", self.tabla, data))
        return self

    def eq(self, key, value):
        self.filtros.append((key, value))
        return self

    def in_(self, key, values):
        self.filtros.append((key, list(values)))
        return self

    def order(self, columna, desc=False, **kwargs):
        self.orden.append((columna, desc))
        return self

    def limit(self, size):
        self.limite = size
        return self

    def execute(self):
        self.db.consultas.append(
            ("execute", self.tabla, list(self.filtros), list(self.orden), self.limite, self.datos)
        )
        if self.tabla in self.db.fallan:
            raise RuntimeError(f"la columna category_id no existe en {self.tabla}")
        return self.db.respuestas.get(self.tabla, Result())


class _StubDb:
    def __init__(self, respuestas=None, fallan=None):
        self.respuestas = respuestas or {}
        self.fallan = set(fallan or [])
        self.consultas = []

    def table(self, name):
        return _StubQuery(self, name)


def _repositorio(respuestas=None, fallan=None):
    from app.repositories.categories_repository import CategoriesRepository

    repo = CategoriesRepository()
    repo.db = _StubDb(respuestas, fallan)
    return repo


class TestRepositorioImpacto:
    async def test_lista_los_productos_con_el_movimiento_padre(self):
        repo = _repositorio({
            "transaction_items": Result([
                {"id": "i1", "transaction_id": "t1", "item_name": "Leche",
                 "quantity": 2.0, "total_price": 9800.0}
            ]),
            "transactions": Result([{"id": "t1", "description": "Compra en el super"}]),
        })

        items = repo.list_items_by_category("cat-1")

        assert items[0]["item_name"] == "Leche"
        assert items[0]["transaction_description"] == "Compra en el super"

    async def test_lista_los_movimientos_ordenados_y_limitados(self):
        repo = _repositorio({"transactions": Result([{"id": "t1"}])})

        repo.list_transactions_by_category("cat-1", limit=50)

        ejecucion = [c for c in repo.db.consultas if c[0] == "execute"][0]
        assert ejecucion[3] == [("date", True), ("amount", True)]
        assert ejecucion[4] == 50

    async def test_no_revienta_si_la_columna_no_existe(self):
        repo = _repositorio(fallan={"transaction_items", "debts"})

        assert repo.list_items_by_category("cat-1") == []
        assert repo.list_debts_by_category("cat-1") == []
        assert repo.count_debts_by_category("cat-1") == 0

    async def test_reasignar_solo_hace_updates_y_devuelve_el_conteo(self):
        repo = _repositorio({
            "transactions": Result([{"id": "t1"}]),
            "budgets": Result([{"id": "b1"}]),
            "transaction_items": Result([{"id": "i1"}]),
            "debts": Result([{"id": "d1"}]),
        })

        movidos = repo.reassign_category("cat-1", "fam-1", "cat-2")

        assert movidos == {"transactions": 1, "budgets": 1, "items": 1, "debts": 1}
        operaciones = [c for c in repo.db.consultas if c[0] == "update"]
        assert len(operaciones) == 4, "No se movieron los cuatro tipos"
        for operacion in operaciones:
            assert operacion[2] == {"category_id": "cat-2"}
        assert all(c[0] != "delete" for c in repo.db.consultas), "Se borro historial"

    async def test_reasignar_acota_por_familia_solo_donde_existe(self):
        repo = _repositorio()

        repo.reassign_category("cat-1", "fam-1", "cat-2")

        ejecuciones = [c for c in repo.db.consultas if c[0] == "execute"]
        for ejecucion in ejecuciones:
            if ejecucion[1] == "transaction_items":
                assert ("family_id", "fam-1") not in ejecucion[2], (
                    "transaction_items no tiene columna family_id"
                )
            else:
                assert ("family_id", "fam-1") in ejecucion[2], (
                    "El alcance por familia no se aplico"
                )


class TestListado:
    async def test_muestra_las_por_defecto_y_las_de_la_familia(self):
        service = _service()
        categorias = await service.get_categories(USER_A)
        nombres = {c["name"] for c in categorias}
        assert "Alimentación" in nombres
        assert "Comida" in nombres

    async def test_no_muestra_categorias_de_otra_familia(self):
        service = _service()
        categorias = await service.get_categories(USER_A)
        ids = {c["id"] for c in categorias}
        assert CAT_B not in ids, "Se filtro una categoria de otra familia"


class TestCrear:
    async def test_el_family_id_sale_del_perfil_no_del_body(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)

        await service.create_category(
            USER_A,
            {"name": "Mascotas", "type": "expense", "family_id": FAMILY_B},
        )

        assert repo.insertados[0]["family_id"] == FAMILY_A, (
            "El body no puede decidir de que familia es la categoria."
        )

    async def test_rechaza_un_tipo_invalido(self):
        service = _service()
        try:
            await service.create_category(USER_A, {"name": "X", "type": "transfer"})
        except CategoryValidationError:
            return
        raise AssertionError("Se acepto un tipo de categoria invalido")

    async def test_rechaza_nombres_duplicados(self):
        service = _service()
        try:
            await service.create_category(USER_A, {"name": "Comida", "type": "expense"})
        except CategoryConflictError:
            return
        raise AssertionError("Se acepto una categoria duplicada")

    async def test_rechaza_usuarios_sin_familia(self):
        service = _service()
        try:
            await service.create_category("sin-familia", {"name": "X", "type": "expense"})
        except CategoryValidationError:
            return
        raise AssertionError("Se creo una categoria para un usuario sin familia")


class TestEditar:
    async def test_no_puede_editar_una_categoria_por_defecto(self):
        service = _service()
        try:
            await service.update_category(USER_A, CAT_DEFAULT, {"name": "Cambiada"})
        except CategoryPermissionError:
            return
        raise AssertionError("Se pudo editar una categoria por defecto")

    async def test_no_puede_editar_una_categoria_de_otra_familia(self):
        service = _service()
        try:
            await service.update_category(USER_A, CAT_B, {"name": "Cambiada"})
        except CategoryPermissionError:
            return
        raise AssertionError("Se pudo editar una categoria de otra familia")

    async def test_actualiza_la_categoria_propia(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)
        await service.update_category(USER_A, CAT_A, {"name": "Comida casera"})
        assert repo.actualizados[0][1]["name"] == "Comida casera"


class TestBorrar:
    async def test_no_puede_borrar_una_categoria_por_defecto(self):
        service = _service()
        try:
            await service.delete_category(USER_A, CAT_DEFAULT)
        except CategoryPermissionError:
            return
        raise AssertionError("Se pudo borrar una categoria por defecto")

    async def test_no_puede_borrar_una_categoria_de_otra_familia(self):
        service = _service()
        try:
            await service.delete_category(USER_A, CAT_B)
        except CategoryPermissionError:
            return
        raise AssertionError("Se pudo borrar una categoria de otra familia")

    async def test_desvincula_en_vez_de_borrar_el_historial(self):
        repo = FakeCategoriesRepository()
        repo.transacciones_por_categoria = 3
        repo.presupuestos_por_categoria = 1
        repo.items_por_categoria = 2
        service = _service(repo)

        resultado = await service.delete_category(USER_A, CAT_A)

        assert resultado["deleted"] is True
        avisos = resultado["warnings"]
        assert avisos["transactions_affected"] == 3
        assert avisos["budgets_affected"] == 1
        assert avisos["items_affected"] == 2
        assert "presupuesto" in avisos["message"].lower()

        # Desvincula (update ... set category_id = null) y NO borra historial.
        operaciones = [c for c in repo.db.llamadas if isinstance(c, tuple)]
        assert operaciones, "No se desvinculo nada"
        for operacion in operaciones:
            assert operacion[0] == "update", "Se borro historial en vez de desvincularlo"

    async def test_avisa_si_el_esquema_no_permite_conservar_el_presupuesto(self):
        repo = FakeCategoriesRepository()
        repo.presupuestos_por_categoria = 1
        repo.puede_desvincular_presupuestos = False
        service = _service(repo)

        original = repo.db
        repo.db = _BloqueadoDB(original)
        try:
            await service.delete_category(USER_A, CAT_A)
        except CategoryConflictError:
            return
        finally:
            repo.db = original
        raise AssertionError("Se borro una categoria que tiene presupuestos asociados")

    async def test_desvincula_las_deudas_y_devuelve_el_detalle(self):
        repo = FakeCategoriesRepository()
        repo.deudas_por_categoria = 2
        service = _service(repo)

        resultado = await service.delete_category(USER_A, CAT_A)

        avisos = resultado["warnings"]
        assert avisos["debts_affected"] == 2, "No se reporto cuantas deudas quedan sin categoria"
        assert avisos["affected"]["debts"] == DEUDAS, "No se incluyo el detalle de las deudas"
        assert "deuda" in avisos["message"].lower()

        # Las deudas se desvinculan con un UPDATE: nunca se borra historial.
        operaciones = [c for c in repo.db.llamadas if isinstance(c, tuple)]
        assert operaciones, "No se desvinculo nada"
        for operacion in operaciones:
            assert operacion[0] == "update", "Se borro historial en vez de desvincularlo"
        assert "debts" in repo.db.llamadas, "No se toco la tabla de deudas"

    async def test_el_detalle_del_borrado_tiene_la_misma_forma_que_el_impacto(self):
        repo = FakeCategoriesRepository()
        repo.transacciones_por_categoria = 2
        repo.presupuestos_por_categoria = 1
        repo.items_por_categoria = 1
        repo.deudas_por_categoria = 2
        service = _service(repo)

        # El impacto se pide ANTES del borrado (despues la categoria ya no existe).
        impacto = await service.get_category_impact(USER_A, CAT_A)
        resultado = await service.delete_category(USER_A, CAT_A)
        afectados = resultado["warnings"]["affected"]
        assert set(afectados.keys()) == {"transactions", "budgets", "items", "debts"}
        for clave in ("transactions", "budgets", "items", "debts"):
            assert afectados[clave] == impacto[clave], f"La lista '{clave}' no coincide con el impacto"


class _BloqueadoDB:
    """Simula un esquema que todavia no admite `budgets.category_id = NULL`."""

    def __init__(self, original):
        self.original = original
        self.llamadas = original.llamadas

    def table(self, name):
        if name == "budgets":
            raise RuntimeError("columna category_id no admite null")
        return self.original.table(name)


class TestImpacto:
    async def test_devuelve_los_conteos_y_las_listas(self):
        repo = FakeCategoriesRepository()
        repo.transacciones_por_categoria = 2
        repo.presupuestos_por_categoria = 1
        repo.items_por_categoria = 1
        repo.deudas_por_categoria = 2
        service = _service(repo)

        impacto = await service.get_category_impact(USER_A, CAT_A)

        assert impacto["category"] == {"id": CAT_A, "name": "Comida", "type": "expense"}
        assert impacto["counts"] == {
            "transactions": 2,
            "budgets": 1,
            "items": 1,
            "debts": 2,
        }
        assert [t["id"] for t in impacto["transactions"]] == [
            "11111111-1111-1111-1111-111111111111",
            "11111111-1111-1111-1111-111111111112",
        ]
        assert impacto["transactions"][0]["description"] == "Compra en el super"
        assert impacto["budgets"][0]["period"] == "monthly"
        assert impacto["budgets"][0]["week_number"] is None
        assert impacto["items"][0]["transaction_description"] == "Compra en el super"
        assert impacto["debts"][0]["remaining_amount"] == 200000.0

    async def test_no_puede_ver_el_impacto_de_una_categoria_por_defecto(self):
        service = _service()
        try:
            await service.get_category_impact(USER_A, CAT_DEFAULT)
        except CategoryPermissionError:
            return
        raise AssertionError("Se vio el impacto de una categoria por defecto")

    async def test_no_puede_ver_el_impacto_de_una_categoria_de_otra_familia(self):
        service = _service()
        try:
            await service.get_category_impact(USER_A, CAT_B)
        except CategoryPermissionError:
            return
        raise AssertionError("Se vio el impacto de una categoria de otra familia")

    async def test_una_categoria_inexistente_da_404(self):
        service = _service()
        try:
            await service.get_category_impact(USER_A, "no-existe")
        except CategoryNotFoundError:
            return
        raise AssertionError("No se lanzo 404 para una categoria inexistente")


class TestReasignar:
    async def test_mueve_los_cuatro_tipos(self):
        repo = FakeCategoriesRepository()
        repo.transacciones_por_categoria = 12
        repo.presupuestos_por_categoria = 1
        repo.items_por_categoria = 34
        repo.deudas_por_categoria = 2
        service = _service(repo)

        resultado = await service.reassign_category(USER_A, CAT_A, CAT_A2)

        assert resultado == {
            "moved": {"transactions": 12, "budgets": 1, "items": 34, "debts": 2}
        }
        assert repo.reasignaciones == [(CAT_A, FAMILY_A, CAT_A2)]

    async def test_rechaza_mover_a_la_misma_categoria(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)

        try:
            await service.reassign_category(USER_A, CAT_A, CAT_A)
        except CategoryValidationError:
            pass
        else:
            raise AssertionError("Se acepto mover a la misma categoria")

        assert repo.reasignaciones == [], "Se movieron registros a la misma categoria"

    async def test_rechaza_un_destino_de_tipo_contrario(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)

        try:
            await service.reassign_category(USER_A, CAT_A, CAT_A_INGRESO)
        except CategoryValidationError:
            pass
        else:
            raise AssertionError("Se acepto mover un gasto a una categoria de ingreso")

        assert repo.reasignaciones == [], "Se movieron registros a un tipo incompatible"

    async def test_rechaza_un_destino_de_otra_familia(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)

        try:
            await service.reassign_category(USER_A, CAT_A, CAT_B)
        except CategoryPermissionError:
            pass
        else:
            raise AssertionError("Se acepto mover registros a una categoria de otra familia")

        assert repo.reasignaciones == [], "Se movieron registros fuera de la familia"

    async def test_rechaza_mover_desde_una_categoria_por_defecto(self):
        service = _service()
        try:
            await service.reassign_category(USER_A, CAT_DEFAULT, CAT_A2)
        except CategoryPermissionError:
            return
        raise AssertionError("Se movieron registros desde una categoria por defecto")

    async def test_un_destino_inexistente_da_404(self):
        service = _service()
        try:
            await service.reassign_category(USER_A, CAT_A, "no-existe")
        except CategoryNotFoundError:
            return
        raise AssertionError("No se lanzo 404 para un destino inexistente")


class TestReglasAprendidas:
    async def test_normaliza_comercio_y_palabra_clave(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)

        regla = await service.create_category_rule(
            USER_A, "  Tiendas ARA  ", "LECHE  ", "Alimentación"
        )

        assert regla["merchant"] == "tiendas ara"
        assert regla["raw_keyword"] == "leche"
        assert regla["category"] == "Alimentación"

    async def test_el_user_id_sale_del_token(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)
        await service.create_category_rule(USER_A, "ara", "leche", "Alimentación")
        assert repo.reglas[0]["user_id"] == USER_A

    async def test_rechaza_una_categoria_inexistente(self):
        service = _service()
        try:
            await service.create_category_rule(USER_A, "ara", "leche", "Categoría Inventada")
        except CategoryValidationError:
            return
        raise AssertionError("Se acepto una regla con una categoria que no existe")

    async def test_las_reglas_son_por_usuario(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)
        await service.create_category_rule(USER_A, "ara", "leche", "Alimentación")

        reglas_b = await service.get_category_rules(USER_B)
        assert reglas_b == [], "Las reglas de un usuario se filtrearon a otro"

    async def test_filtra_por_comercio(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)
        await service.create_category_rule(USER_A, "ara", "leche", "Alimentación")
        await service.create_category_rule(USER_A, "exito", "pan", "Alimentación")

        reglas = await service.get_category_rules(USER_A, "ara")
        assert len(reglas) == 1
        assert reglas[0]["merchant"] == "ara"


class TestMatcher:
    async def test_la_regla_gana_al_matcher_generico(self):
        repo = FakeCategoriesRepository()
        service = _service(repo)
        await service.create_category_rule(USER_A, "tiendas ara", "leche", "Comida")

        categorias = [
            {"id": CAT_A, "name": "Comida", "type": "expense", "family_id": FAMILY_A},
            {"id": CAT_DEFAULT, "name": "Alimentación", "type": "expense", "family_id": None},
        ]

        category_id, nombre = await service.match_category_with_rules(
            USER_A, "LECHE 1 L", categorias, merchant="tiendas ara"
        )

        assert category_id == CAT_A
        assert nombre == "Comida"

    async def test_sin_reglas_usa_el_matcher_generico(self):
        service = _service()
        categorias = [
            {"id": CAT_A, "name": "Comida", "type": "expense", "family_id": FAMILY_A},
        ]
        category_id, nombre = await service.match_category_with_rules(
            USER_A, "STARBUCKS 8.500", categorias
        )
        assert category_id == CAT_A
        assert nombre == "Comida"

    async def test_una_categoria_inexistente_da_404(self):
        service = _service()
        try:
            await service.update_category(USER_A, "no-existe", {"name": "X"})
        except CategoryNotFoundError:
            return
        raise AssertionError("No se lanzo 404 para una categoria inexistente")
