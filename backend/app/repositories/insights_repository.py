from typing import Any, Dict, List, Optional

from app.repositories.base import BaseRepository


class InsightsRepository(BaseRepository):
    """Acceso a datos para la capa de analitica del servidor (/insights).

    Solo lectura. Nunca escribe nada.

    Sigue el mismo patrón que `transactions_repository.py`: primero Prisma
    (que además resuelve la categoría y la cuenta en la misma consulta) y
    supabase-py como respaldo. Ningún método lanza excepciones: si la base de
    datos falla se devuelve una lista vacía y el servicio sigue adelante.
    """

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _to_dict(obj: Any) -> Dict[str, Any]:
        if obj is None:
            return {}
        if isinstance(obj, dict):
            return dict(obj)
        if hasattr(obj, "dict"):
            try:
                return obj.dict()
            except Exception:
                pass
        if hasattr(obj, "model_dump"):
            try:
                return obj.model_dump()
            except Exception:
                pass
        return {}

    # ------------------------------------------------------------------
    # Perfil / familia    # ------------------------------------------------------------------
    async def get_user_profile(self, user_id: str) -> Dict[str, Any]:
        """Perfil del usuario (family_id, full_name)."""
        try:
            profile = await self.prisma.profile.find_unique(where={"id": user_id})
            if profile:
                return self._to_dict(profile)
        except Exception:
            pass

        try:
            res = self.db.table("profiles").select("*").eq("id", user_id).execute()
            rows = res.data or []
            return rows[0] if rows else {}
        except Exception:
            return {}

    # ------------------------------------------------------------------
    # Cuentas
    # ------------------------------------------------------------------
    async def get_accounts(
        self, family_id: str, user_id: str, scope: str = "family"
    ) -> List[Dict[str, Any]]:
        """Cuentas del alcance.

        - `personal`: solo cuentas con `user_id` del usuario.
        - `family`: cuentas conjuntas (sin user_id) + las cuentas personales
          del propio usuario. Mismo criterio que `transactions_service.py:62-90`.
        """
        accounts: List[Dict[str, Any]] = []

        try:
            if scope == "personal":
                rows = await self.prisma.account.find_many(where={"user_id": user_id})
            else:
                rows = await self.prisma.account.find_many(
                    where={"family_id": family_id}
                )
            accounts = [self._to_dict(r) for r in rows]
        except Exception:
            accounts = []

        if not accounts:
            try:
                query = self.db.table("accounts").select("*").eq(
                    "family_id", family_id
                )
                if scope == "personal":
                    query = query.eq("user_id", user_id)
                res = query.execute()
                accounts = res.data or []
            except Exception:
                accounts = []

        if scope != "personal":
            accounts = [
                acc
                for acc in accounts
                if not acc.get("user_id") or str(acc.get("user_id")) == str(user_id)
            ]

        return accounts

    # ------------------------------------------------------------------
    # Transacciones
    # ------------------------------------------------------------------
    async def get_transactions(
        self,
        family_id: str,
        account_ids: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Transacciones de la familia en un rango, con la categoría resuelta."""
        if not account_ids:
            return []

        try:
            where: Dict[str, Any] = {
                "family_id": family_id,
                "account_id": {"in": list(account_ids)},
            }
            if start_date or end_date:
                where["date"] = {}
                if start_date:
                    where["date"]["gte"] = start_date
                if end_date:
                    where["date"]["lte"] = end_date

            rows = await self.prisma.transaction.find_many(
                where=where,
                include={"category": True, "account": True},
                order={"date": "asc"},
            )
            return [self._to_dict(r) for r in rows]
        except Exception:
            pass

        try:
            query = (
                self.db.table("transactions")
                .select("*")
                .eq("family_id", family_id)
                .in_("account_id", list(account_ids))
            )
            if start_date:
                query = query.gte("date", start_date)
            if end_date:
                query = query.lte("date", end_date)
            res = query.execute()
            rows = res.data or []
            # No se embebe `accounts` porque hay dos FK (account_id y
            # target_account_id) y PostgREST no puede desambiguar: se resuelve
            # con consultas aparte.
            self._attach_relations(rows)
            return rows
        except Exception:
            return []

    def _attach_relations(self, rows: List[Dict[str, Any]]) -> None:
        """Resuelve categoría (y cuenta) de las filas coming de supabase-py."""
        if not rows:
            return

        category_ids = {
            str(r.get("category_id")) for r in rows if r.get("category_id")
        }
        categories: Dict[str, Dict[str, Any]] = {}
        if category_ids:
            try:
                res = (
                    self.db.table("categories")
                    .select("id,name,type")
                    .in_("id", list(category_ids))
                    .execute()
                )
                categories = {
                    str(c.get("id")): c for c in (res.data or []) if c.get("id")
                }
            except Exception:
                categories = {}

        account_ids = {str(r.get("account_id")) for r in rows if r.get("account_id")}
        accounts: Dict[str, Dict[str, Any]] = {}
        if account_ids:
            try:
                res = (
                    self.db.table("accounts")
                    .select("id,name,type")
                    .in_("id", list(account_ids))
                    .execute()
                )
                accounts = {
                    str(a.get("id")): a for a in (res.data or []) if a.get("id")
                }
            except Exception:
                accounts = {}

        for row in rows:
            category = categories.get(str(row.get("category_id")))
            if category:
                row["category"] = category
            account = accounts.get(str(row.get("account_id")))
            if account:
                row["account"] = account

    # ------------------------------------------------------------------
    # Presupuestos
    # ------------------------------------------------------------------
    async def get_budgets(self, family_id: str) -> List[Dict[str, Any]]:
        """Presupuestos de la familia con su categoría resuelta."""
        budgets: List[Dict[str, Any]] = []

        try:
            rows = await self.prisma.budget.find_many(
                where={"family_id": family_id},
                include={"category": True},
            )
            budgets = [self._to_dict(r) for r in rows]
        except Exception:
            budgets = []

        if not budgets:
            try:
                res = (
                    self.db.table("budgets")
                    .select("*")
                    .eq("family_id", family_id)
                    .execute()
                )
                budgets = res.data or []
                self._attach_relations(budgets)
            except Exception:
                budgets = []

        # El modelo Prisma de Budget no tiene `user_id`, pero la columna sí
        # existe en la base de datos. Se completa para poder distinguir
        # presupuestos personales de los familiares.
        if budgets and not any("user_id" in b for b in budgets):
            try:
                res = (
                    self.db.table("budgets")
                    .select("id,user_id")
                    .eq("family_id", family_id)
                    .execute()
                )
                user_map = {
                    str(b.get("id")): b.get("user_id")
                    for b in (res.data or [])
                    if b.get("id")
                }
                for budget in budgets:
                    if str(budget.get("id")) in user_map:
                        budget["user_id"] = user_map[str(budget.get("id"))]
            except Exception:
                pass

        return budgets

    # ------------------------------------------------------------------
    # Miembros
    # ------------------------------------------------------------------
    async def get_profiles(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        """Perfiles de los miembros (para resolver `full_name`)."""
        ids = [str(u) for u in user_ids if u]
        if not ids:
            return []

        try:
            rows = await self.prisma.profile.find_many(where={"id": {"in": ids}})
            return [self._to_dict(r) for r in rows]
        except Exception:
            pass

        try:
            res = self.db.table("profiles").select("*").in_("id", ids).execute()
            return res.data or []
        except Exception:
            return []
