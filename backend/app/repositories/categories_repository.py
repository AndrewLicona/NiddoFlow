import logging
from typing import Dict, List, Optional

from app.repositories.base import BaseRepository

logger = logging.getLogger(__name__)

# Tope de filas que se devuelven en el detalle del impacto. Los conteos
# siempre traen el total real, aunque la lista este truncada.
IMPACT_LIMIT = 50

class CategoriesRepository(BaseRepository):
    def get_user_profile(self, user_id: str):
        return self.db.table("profiles").select("family_id").eq("id", user_id).execute()

    def get_categories(self, family_id: Optional[str] = None):
        query = self.db.table("categories").select("*")
        if family_id:
            query = query.or_(f"is_default.eq.true,family_id.eq.{family_id}")
        else:
            query = query.eq("is_default", True)
        return query.execute()

    async def get_family_context(self, user_id: str):
        """Devuelve ``(family_id, categorias_visibles)`` del usuario.

        Nunca devuelve categorías de otras familias: si el usuario no tiene
        familia, solo ve las categorías por defecto del sistema.

        Ruta Prisma con respaldo en supabase-py, como el resto del
        repositorio.
        """
        family_id = None
        try:
            profile = await self.prisma.profile.find_unique(where={"id": user_id})
            family_id = getattr(profile, "family_id", None) if profile else None
        except Exception:
            family_id = None

        if family_id is None:
            profile_res = self.get_user_profile(user_id)
            family_id = profile_res.data[0].get('family_id') if profile_res.data else None

        records: List[dict] = []
        try:
            if family_id:
                where = {"OR": [{"is_default": True}, {"family_id": family_id}]}
            else:
                where = {"is_default": True}
            rows = await self.prisma.category.find_many(where=where)
            for category in rows:
                records.append({
                    "id": getattr(category, "id", None),
                    "name": getattr(category, "name", None),
                    "type": getattr(category, "type", None),
                    "is_default": bool(getattr(category, "is_default", False)),
                })
            return family_id, records
        except Exception:
            pass

        res = self.get_categories(family_id)
        for category in res.data or []:
            records.append({
                "id": category.get("id"),
                "name": category.get("name"),
                "type": category.get("type"),
                "is_default": bool(category.get("is_default")),
            })
        return family_id, records

    # --- CRUD ---------------------------------------------------------------

    def get_category_by_id(self, category_id: str):
        return self.db.table("categories").select("*").eq("id", category_id).execute()

    def insert_category(self, data: dict):
        return self.db.table("categories").insert(data).execute()

    def update_category(self, category_id: str, family_id: str, data: dict):
        """Actualiza SOLO categorías de la familia indicada (nunca las default)."""
        return (
            self.db.table("categories")
            .update(data)
            .eq("id", category_id)
            .eq("family_id", family_id)
            .execute()
        )

    def delete_category(self, category_id: str, family_id: str):
        """Borra SOLO categorías de la familia indicada (nunca las default)."""
        return (
            self.db.table("categories")
            .delete()
            .eq("id", category_id)
            .eq("family_id", family_id)
            .execute()
        )

    # --- Impacto de un borrado (para los `warnings` del DELETE) -------------

    def count_transactions_by_category(self, category_id: str):
        res = self.db.table("transactions").select("id", count="exact").eq("category_id", category_id).execute()
        return res.count or 0

    def count_budgets_by_category(self, category_id: str):
        res = self.db.table("budgets").select("id", count="exact").eq("category_id", category_id).execute()
        return res.count or 0

    def count_items_by_category(self, category_id: str):
        """Items de factura que apuntan a esta categoría.

        `transaction_items.category_id` es una columna nueva (agente G). Si la
        migración todavía no está aplicada, la consulta falla y devolvemos 0
        en lugar de tumbar el borrado (regla 10.7: los errores no rompen el flujo).
        """
        try:
            res = (
                self.db.table("transaction_items")
                .select("id", count="exact")
                .eq("category_id", category_id)
                .execute()
            )
            return res.count or 0
        except Exception as exc:
            logger.warning(
                "No se pudieron contar los productos de la categoria %s: %s", category_id, exc
            )
            return 0

    def count_debts_by_category(self, category_id: str):
        """Nº de deudas que apuntan a esta categoría.

        `debts.category_id` puede no existir todavia (migracion pendiente):
        en ese caso se devuelve 0 con un aviso, sin tumbar el flujo.
        """
        try:
            res = (
                self.db.table("debts")
                .select("id", count="exact")
                .eq("category_id", category_id)
                .execute()
            )
            return res.count or 0
        except Exception as exc:
            logger.warning(
                "No se pudieron contar las deudas de la categoria %s: %s", category_id, exc
            )
            return 0

    # --- Detalle del impacto (listas truncadas) ---------------------------

    def list_transactions_by_category(self, category_id: str, limit: int = IMPACT_LIMIT) -> List[dict]:
        """Movimientos que apuntan a la categoría (fecha e importe descendente).

        Nunca revienta: si la tabla o alguna columna no existe, devuelve []
        con un aviso en el log.
        """
        try:
            res = (
                self.db.table("transactions")
                .select("id,description,amount,date,type")
                .eq("category_id", category_id)
                .order("date", desc=True)
                .order("amount", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            logger.warning(
                "No se pudieron listar los movimientos de la categoria %s: %s", category_id, exc
            )
            return []
        return res.data or []

    def list_budgets_by_category(self, category_id: str, limit: int = IMPACT_LIMIT) -> List[dict]:
        """Presupuestos que apuntan a la categoría (importe descendente)."""
        try:
            res = (
                self.db.table("budgets")
                .select("id,amount,period,month,week_number,year,user_id")
                .eq("category_id", category_id)
                .order("year", desc=True)
                .order("month", desc=True)
                .order("amount", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            logger.warning(
                "No se pudieron listar los presupuestos de la categoria %s: %s", category_id, exc
            )
            return []
        return res.data or []

    def list_items_by_category(self, category_id: str, limit: int = IMPACT_LIMIT) -> List[dict]:
        """Productos de factura que apuntan a la categoría.

        `transaction_items.category_id` es una columna nueva: si la migracion
        todavia no esta aplicada, se devuelve [] con un aviso.
        """
        try:
            res = (
                self.db.table("transaction_items")
                .select("id,transaction_id,item_name,quantity,total_price")
                .eq("category_id", category_id)
                .order("total_price", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            logger.warning(
                "No se pudieron listar los productos de la categoria %s: %s", category_id, exc
            )
            return []

        rows = res.data or []
        descriptions = self._get_transaction_descriptions(
            [row.get("transaction_id") for row in rows]
        )
        items = []
        for row in rows:
            items.append({
                "id": row.get("id"),
                "transaction_id": row.get("transaction_id"),
                "item_name": row.get("item_name"),
                "quantity": row.get("quantity"),
                "total_price": row.get("total_price"),
                "transaction_description": descriptions.get(row.get("transaction_id")),
            })
        return items

    def list_debts_by_category(self, category_id: str, limit: int = IMPACT_LIMIT) -> List[dict]:
        """Deudas que apuntan a la categoría (vencimiento e importe descendente)."""
        try:
            res = (
                self.db.table("debts")
                .select("id,description,total_amount,remaining_amount,type,due_date")
                .eq("category_id", category_id)
                .order("due_date", desc=True)
                .order("total_amount", desc=True)
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            logger.warning(
                "No se pudieron listar las deudas de la categoria %s: %s", category_id, exc
            )
            return []
        return res.data or []

    def _get_transaction_descriptions(self, transaction_ids) -> Dict[str, str]:
        """Descripciones de los movimientos padre de los productos.

        Se consultan aparte (y con tolerancia a fallos) para no depender de un
        `join` embebido de PostgREST.
        """
        ids = [str(t) for t in (transaction_ids or []) if t]
        if not ids:
            return {}
        try:
            res = (
                self.db.table("transactions")
                .select("id,description")
                .in_("id", ids)
                .execute()
            )
        except Exception as exc:
            logger.warning("No se pudieron leer los movimientos de los productos: %s", exc)
            return {}
        return {row.get("id"): row.get("description") for row in (res.data or [])}

    # --- Reasignacion de registros a otra categoria -----------------------

    def reassign_category(
        self, category_id: str, family_id: str, target_category_id: str
    ) -> Dict[str, int]:
        """Mueve los registros de una categoría a otra.

        Solo `UPDATE ... SET category_id = ...` sobre filas filtradas por la
        categoria origen: nunca se borra historial.

        `family_id` acota el alcance en las tablas que lo tienen
        (`transactions`, `budgets`, `debts`). `transaction_items` no tiene
        esa columna: se mueve por la categoria origen.
        """
        return {
            "transactions": self._reassign_rows(
                "transactions", category_id, family_id, target_category_id
            ),
            "budgets": self._reassign_rows(
                "budgets", category_id, family_id, target_category_id
            ),
            "items": self._reassign_rows(
                "transaction_items", category_id, None, target_category_id
            ),
            "debts": self._reassign_rows(
                "debts", category_id, family_id, target_category_id
            ),
        }

    def _reassign_rows(
        self,
        table: str,
        category_id: str,
        family_id: Optional[str],
        target_category_id: str,
    ) -> int:
        """Mueve las filas de `table` de una categoría a otra. Devuelve cuántas.

        Si la tabla o la columna no existen todavia, se registra un aviso y se
        devuelve 0: la reasignacion nunca tumba el flujo.
        """
        try:
            query = (
                self.db.table(table)
                .update({"category_id": target_category_id})
                .eq("category_id", category_id)
            )
            if family_id:
                query = query.eq("family_id", family_id)
            res = query.execute()
            data = getattr(res, "data", None)
            return len(data) if data else 0
        except Exception as exc:
            logger.warning(
                "No se pudieron mover los registros de %s a la categoria %s: %s",
                table,
                target_category_id,
                exc,
            )
            return 0

    # --- Reglas aprendidas (user_category_rules) ---------------------------

    def get_category_rules(self, user_id: str, merchant: Optional[str] = None):
        query = self.db.table("user_category_rules").select("*").eq("user_id", user_id)
        if merchant:
            query = query.eq("merchant", merchant)
        return query.execute()

    def upsert_category_rule(self, data: dict):
        """Upsert sobre el unique (user_id, merchant, raw_keyword).

        ``default_to_null=False`` hace que las columnas ausentes (``id``)
        usen su valor por defecto de la base de datos en vez de NULL.
        """
        return (
            self.db.table("user_category_rules")
            .upsert(
                data,
                on_conflict="user_id,merchant,raw_keyword",
                default_to_null=False,
            )
            .execute()
        )

    def get_category_by_name(self, name: str, family_id: Optional[str] = None):
        """Busca una categoría por nombre exacto dentro del alcance de la familia."""
        query = self.db.table("categories").select("*").eq("name", name)
        if family_id:
            query = query.or_(f"is_default.eq.true,family_id.eq.{family_id}")
        return query.execute()

    # --- Items de factura (transaction_items) -------------------------------

    def get_transaction_family(self, transaction_id: str):
        """Familia de la transaccion (para resolver categorias en su ambito)."""
        res = self.db.table("transactions").select("family_id").eq("id", transaction_id).execute()
        return res.data[0] if res.data else None

    def get_transaction_items(self, transaction_id: str):
        return (
            self.db.table("transaction_items")
            .select("*")
            .eq("transaction_id", transaction_id)
            .execute()
        )

    def update_transaction_item_category(self, item_id: str, category_id: Optional[str], confidence: Optional[float] = None):
        """Fija la categoría real (y la confianza) de un item de factura.

        `category_id` usa `on delete set null`, así que el historial nunca se
        pierde: el item queda sin categoría pero sigue existiendo.
        """
        payload = {"category_id": category_id}
        if confidence is not None:
            payload["confidence"] = confidence
        return self.db.table("transaction_items").update(payload).eq("id", item_id).execute()
