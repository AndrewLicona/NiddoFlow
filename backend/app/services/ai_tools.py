"""Herramientas de solo lectura que el chat de NiddoAI puede invocar.

Contrato: CONTRATOS_IMPLEMENTACION.md §5.2.

Reglas inviolables de este módulo:

* **NINGUNA herramienta escribe.** Solo hay lecturas (`get_*`). La IA propone y
  el usuario confirma (patrón `propose_*`, §5.3). Ninguna función de este
  archivo llama a un método de escritura de Prisma ni de PostgREST.
* Los datos agregados (totales, gasto por categoría, gasto por miembro,
  presupuestos, recurrentes) salen de `InsightsService` (agente A), de modo que
  la IA ve EXACTAMENTE los mismos números que `/insights` y que `/budgets`.
* Un parámetro inválido o fuera de rango produce un **error suave**
  (`{"error": "..."}`) que se le devuelve al modelo: nunca una excepción.
* El `scope` lo decide el modelo según la pregunta: `personal` para "¿gasté
  yo?" y `family` para "¿gastamos?".

El módulo NO importa `google.genai`: expone las declaraciones como diccionarios
simples y el servicio de chat las convierte a `types.Tool`.
"""

import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from app.repositories.debts_repository import DebtsRepository
from app.repositories.insights_repository import InsightsRepository
from app.repositories.transactions_repository import TransactionsRepository
from app.services.debts_service import DebtsService
from app.services.insights_service import InsightsService, month_bounds, parse_month

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Constantes
# --------------------------------------------------------------------------- #
VALID_SCOPES = ("family", "personal")

# Tope de movimientos que se devuelven en una sola llamada.
MAX_TRANSACTION_LIMIT = 200
DEFAULT_TRANSACTION_LIMIT = 25

# Nº máximo de transacciones que se leen de la base para después filtrar.
TRANSACTIONS_FETCH_MULTIPLIER = 5
MAX_TRANSACTIONS_FETCH = 500

# Meses en formato YYYY-MM.
MONTH_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

# Tipos de movimiento admitidos en las propuestas.
VALID_TRANSACTION_TYPES = ("expense", "income", "transfer")

# Palabras que aparecen en los títulos de los estados de deuda.
DEBT_TYPE_LABELS = {
    "to_pay": "Deuda por pagar",
    "to_receive": "Deuda por cobrar",
    "to_collect": "Deuda por cobrar",
}


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def _normalize_text(value: Optional[str]) -> str:
    """Normaliza un texto: minúsculas, sin tildes y sin espacios extra."""
    if not value:
        return ""
    plain = unicodedata.normalize("NFKD", str(value))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", plain.strip().lower())


def _to_dict(value: Any) -> Dict[str, Any]:
    """Convierte un objeto (Prisma o Pydantic) en un diccionario plano."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "dict"):
        try:
            return value.dict()
        except Exception:
            pass
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump()
        except Exception:
            pass
    return {}


def _rows(result: Any) -> List[Dict[str, Any]]:
    """Normaliza el resultado de un repositorio a una lista de diccionarios."""
    if result is None:
        return []
    data = getattr(result, "data", None)
    if data is None and isinstance(result, dict):
        data = result.get("data")
    if data is None and isinstance(result, list):
        data = result
    return [_to_dict(row) for row in (data or [])]


def _soft_error(message: str) -> Dict[str, Any]:
    """Respuesta de error suave: se le devuelve al modelo tal cual."""
    return {"error": message}


def _normalize_scope(scope: Any) -> Tuple[Optional[str], Optional[str]]:
    """Valida el `scope`. Devuelve (scope, error)."""
    if scope is None or (isinstance(scope, str) and not scope.strip()):
        return "family", None
    if not isinstance(scope, str):
        return None, "El scope debe ser 'family' (la familia) o 'personal' (solo el usuario)."
    value = scope.strip().lower()
    if value not in VALID_SCOPES:
        return None, (
            f"Scope '{scope}' inválido. Usa 'family' para el gasto de la familia "
            "o 'personal' para el gasto del propio usuario."
        )
    return value, None


def _normalize_month(month: Any) -> Tuple[Optional[str], Optional[str]]:
    """Valida el mes (YYYY-MM). Devuelve (mes_o_None, error)."""
    if month is None or (isinstance(month, str) and not month.strip()):
        return None, None
    if not isinstance(month, str) or not MONTH_PATTERN.match(month.strip()):
        return None, (
            f"Mes '{month}' inválido. Debe tener el formato YYYY-MM (por ejemplo 2026-10)."
        )
    return month.strip(), None


def _optional_number(value: Any, field: str) -> Tuple[Optional[float], Optional[str]]:
    """Valida un número opcional no negativo. Devuelve (valor_o_None, error)."""
    if value is None or value == "":
        return None, None
    if isinstance(value, bool):
        return None, f"El parámetro '{field}' debe ser un número."
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, f"El parámetro '{field}' debe ser un número (recibido: {value!r})."
    if number != number:  # NaN
        return None, f"El parámetro '{field}' no es un número válido."
    if number < 0:
        return None, f"El parámetro '{field}' no puede ser negativo (recibido: {number})."
    return number, None


def _optional_limit(value: Any) -> Tuple[int, Optional[str]]:
    """Valida el `limit` de las transacciones. Devuelve (límite_o_0, error)."""
    if value is None or value == "":
        return DEFAULT_TRANSACTION_LIMIT, None
    if isinstance(value, bool):
        return 0, "El parámetro 'limit' debe ser un número entero."
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0, f"El parámetro 'limit' debe ser un número entero (recibido: {value!r})."
    if number < 1 or number > MAX_TRANSACTION_LIMIT:
        return 0, (
            f"El parámetro 'limit' debe estar entre 1 y {MAX_TRANSACTION_LIMIT} "
            f"(recibido: {number})."
        )
    return number, None


def _format_money(value: Any) -> str:
    """Formato de miles español (1.234.567)."""
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0.0
    return f"{number:,.0f}".replace(",", ".")


def _format_date(value: Any) -> str:
    """Fecha en formato YYYY-MM-DD (acepta datetime, date o texto ISO)."""
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        try:
            return value.strftime("%Y-%m-%d")
        except Exception:
            pass
    text = str(value)
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return text


# --------------------------------------------------------------------------- #
# Declaraciones de las herramientas (formato FunctionDeclaration de Gemini)
# --------------------------------------------------------------------------- #
SCOPE_PROPERTY = {
    "type": "string",
    "enum": list(VALID_SCOPES),
    "description": (
        "Alcance del dato. Usa 'personal' si la pregunta es sobre el usuario "
        "('¿gasté yo?', '¿cuánto gasté?', 'mi gasto') y 'family' si es sobre "
        "la familia ('¿gastamos?', '¿cuánto gastamos?', 'el hogar')."
    ),
}

MONTH_PROPERTY = {
    "type": "string",
    "description": (
        "Mes en formato YYYY-MM (por ejemplo 2026-10). Si se omite se usa el mes actual."
    ),
}

TOOL_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "get_summary",
        "description": (
            "Totales del mes: ingresos, gastos, balance, tasa de ahorro, número de "
            "movimientos y variación frente al mes anterior. Úsala para preguntas "
            "como '¿cuánto gastamos este mes?' o '¿cuánto ahorré?'. "
            "El scope lo decides tú según la pregunta: 'personal' si habla de 'yo', "
            "'family' si habla de 'nosotros' o 'la familia'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
                "month": dict(MONTH_PROPERTY),
            },
        },
    },
    {
        "name": "get_spend_by_category",
        "description": (
            "Desglose del gasto del mes por categoría, con el nombre de la categoría, "
            "el monto, el porcentaje sobre el total y la variación frente al mes "
            "anterior. Úsala para '¿en qué gastamos más?' o '¿cuánto va en comida?'. "
            "El scope lo decides tú: 'personal' para 'mi gasto', 'family' para 'el de la familia'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
                "month": dict(MONTH_PROPERTY),
            },
        },
    },
    {
        "name": "get_spend_by_member",
        "description": (
            "Desglose del gasto del mes por miembro de la familia, con su nombre, el "
            "monto y cuántos movimientos tiene. Úsala para '¿quién gastó más?' o "
            "'¿cuánto gastó Jhosep?'. El scope lo decides tú según la pregunta."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
                "month": dict(MONTH_PROPERTY),
            },
        },
    },
    {
        "name": "get_budget_status",
        "description": (
            "Estado de cada presupuesto: categoría, límite, gastado REAL, restante, "
            "porcentaje y si está en estado 'ok', 'warning' (>=80%) o 'critical' "
            "(>=100%). Úsala para '¿cómo van mis presupuestos?' o '¿me pasé de presupuesto?'. "
            "El scope lo decides tú según la pregunta."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
                "month": dict(MONTH_PROPERTY),
            },
        },
    },
    {
        "name": "get_transactions",
        "description": (
            "Lista de movimientos (ingresos, gastos y transferencias) con fecha, "
            "descripción, monto, categoría, miembro y cuenta. Permite filtrar por "
            "categoría, miembro y rango de monto. Úsala para '¿cuál fue el gasto más "
            "caro?' o 'muéstrame los gastos de transporte'. "
            "El scope lo decides tú según la pregunta."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
                "month": dict(MONTH_PROPERTY),
                "category": {
                    "type": "string",
                    "description": (
                        "Nombre de la categoría a filtrar (por ejemplo 'Alimentación'). "
                        "Si se omite, se devuelven todas."
                    ),
                },
                "member": {
                    "type": "string",
                    "description": (
                        "Nombre del miembro que realizó el movimiento (por ejemplo "
                        "'Andrew Licona'). Si se omite, se devuelven todos."
                    ),
                },
                "min_amount": {
                    "type": "number",
                    "description": "Monto mínimo del movimiento (inclusive).",
                },
                "max_amount": {
                    "type": "number",
                    "description": "Monto máximo del movimiento (inclusive).",
                },
                "limit": {
                    "type": "integer",
                    "description": (
                        f"Máximo de movimientos a devolver (entre 1 y {MAX_TRANSACTION_LIMIT})."
                    ),
                },
            },
        },
    },
    {
        "name": "get_debts",
        "description": (
            "Deudas del hogar: descripción, si es por pagar o por cobrar, total, "
            "saldo pendiente, estado y fecha de vencimiento. Úsala para '¿qué debo?' "
            "o '¿cuánto tengo por cobrar?'. Las deudas siempre son de la familia: el "
            "parámetro scope se acepta por uniformidad pero no cambia el resultado."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
            },
        },
    },
    {
        "name": "get_recurring",
        "description": (
            "Gastos recurrentes detectados: comercio, monto, periodicidad "
            "(semanal, quincenal, mensual...), última vez que se vio y confianza. "
            "Úsala para '¿qué gastos recurrentes tengo?' o '¿cuánto me cuesta Netflix?'. "
            "El scope lo decides tú según la pregunta."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "scope": dict(SCOPE_PROPERTY),
            },
        },
    },
    {
        "name": "get_price_history",
        "description": (
            "Historial de precios de un producto: cada vez que se compró, con la "
            "fecha, el precio unitario, la cantidad y el total. Úsala para '¿a cuánto "
            "salió el café?' o '¿el arroz ha subido?'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product": {
                    "type": "string",
                    "description": "Nombre (o parte del nombre) del producto buscado.",
                },
            },
            "required": ["product"],
        },
    },
]


# --------------------------------------------------------------------------- #
# Contexto y registro de herramientas
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ToolContext:
    """Datos que accompanyan a cada llamada a una herramienta."""
    user_id: str


ToolHandler = Callable[[ToolContext, Dict[str, Any]], Awaitable[Dict[str, Any]]]


@dataclass
class ToolSpec:
    """Una herramienta: su declaración para Gemini y su manejador."""
    name: str
    declaration: Dict[str, Any]
    handler: ToolHandler


class AITools:
    """Registro de herramientas de solo lectura del chat.

    Todas se resuelven contra `InsightsService` (datos agregados) o contra los
    repositorios de lectura (transacciones, deudas, cuentas, categorías).
    """

    def __init__(
        self,
        insights_service: Optional[InsightsService] = None,
        insights_repository: Optional[InsightsRepository] = None,
        transactions_repository: Optional[TransactionsRepository] = None,
        debts_service: Optional[DebtsService] = None,
    ):
        self.insights_repository = insights_repository or InsightsRepository()
        self.insights = insights_service or InsightsService(self.insights_repository)
        self.transactions_repository = transactions_repository or TransactionsRepository()
        self.debts_service = debts_service or DebtsService(DebtsRepository())
        self._handlers: Dict[str, ToolHandler] = {
            "get_summary": self._tool_get_summary,
            "get_spend_by_category": self._tool_get_spend_by_category,
            "get_spend_by_member": self._tool_get_spend_by_member,
            "get_budget_status": self._tool_get_budget_status,
            "get_transactions": self._tool_get_transactions,
            "get_debts": self._tool_get_debts,
            "get_recurring": self._tool_get_recurring,
            "get_price_history": self._tool_get_price_history,
        }

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------
    def declarations(self) -> List[Dict[str, Any]]:
        """Declaraciones de las herramientas (formato FunctionDeclaration)."""
        return [dict(decl) for decl in TOOL_DECLARATIONS]

    def tool_names(self) -> List[str]:
        """Nombres de las herramientas registradas."""
        return list(self._handlers.keys())

    async def dispatch(
        self,
        name: str,
        args: Optional[Dict[str, Any]],
        context: ToolContext,
    ) -> Dict[str, Any]:
        """Ejecuta una herramienta. Nunca propaga excepciones.

        Un nombre desconocido o un fallo interno devuelven un error suave
        para que el modelo pueda explicarlo al usuario.
        """
        handler = self._handlers.get(name)
        if handler is None:
            return _soft_error(
                f"La herramienta '{name}' no existe. Herramientas disponibles: "
                f"{', '.join(self.tool_names())}."
            )
        try:
            result = await handler(context, args or {})
        except Exception as exc:  # pragma: no cover - red de seguridad
            logger.exception("[chat] Error ejecutando la herramienta '%s': %s", name, exc)
            return _soft_error(
                f"No se pudo ejecutar la herramienta '{name}' por un error interno: {exc}"
            )
        if not isinstance(result, dict):
            return {"result": result}
        return result

    # ------------------------------------------------------------------
    # Lecturas reutilizables (también las usa el contexto del prompt)
    # ------------------------------------------------------------------
    async def list_accounts(self, user_id: str) -> List[Dict[str, Any]]:
        """Cuentas del hogar: las conjuntas más las personales del usuario."""
        try:
            profile = await self.insights_repository.get_user_profile(user_id)
        except Exception as exc:
            logger.warning("[chat] No se pudo leer el perfil del usuario: %s", exc)
            return []
        family_id = (profile or {}).get("family_id")
        if not family_id:
            return []
        try:
            accounts = await self.insights_repository.get_accounts(
                family_id, user_id, "family"
            )
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer las cuentas: %s", exc)
            return []
        return [_to_dict(account) for account in (accounts or [])]

    async def list_categories(self, user_id: str) -> List[Dict[str, Any]]:
        """Categorías disponibles para la familia (las del usuario + las comunes)."""
        try:
            profile = await self.insights_repository.get_user_profile(user_id)
        except Exception as exc:
            logger.warning("[chat] No se pudo leer el perfil del usuario: %s", exc)
            return []
        family_id = (profile or {}).get("family_id")
        if not family_id:
            return []
        try:
            result = await self.transactions_repository.get_categories(family_id)
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer las categorías: %s", exc)
            return []
        return _rows(result)

    async def list_debts(self, user_id: str) -> List[Dict[str, Any]]:
        """Deudas de la familia (solo lectura)."""
        try:
            debts = await self.debts_service.get_debts(user_id)
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer las deudas: %s", exc)
            return []
        return [_to_dict(debt) for debt in (debts or [])]

    async def list_price_history(
        self, user_id: str, product: str
    ) -> List[Dict[str, Any]]:
        """Historial de precios de un producto (solo lectura)."""
        needle = _normalize_text(product)
        if not needle:
            return []

        try:
            profile = await self.insights_repository.get_user_profile(user_id)
        except Exception as exc:
            logger.warning("[chat] No se pudo leer el perfil del usuario: %s", exc)
            return []
        family_id = (profile or {}).get("family_id")
        if not family_id:
            return []

        try:
            accounts = await self.insights_repository.get_accounts(
                family_id, user_id, "family"
            )
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer las cuentas: %s", exc)
            return []
        account_ids = [
            str(account.get("id"))
            for account in (_to_dict(a) for a in (accounts or []))
            if account.get("id")
        ]
        if not account_ids:
            return []

        try:
            rows = await self.transactions_repository.get_transactions_prisma(
                family_id, account_ids, None, None, MAX_TRANSACTIONS_FETCH
            )
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer los movimientos: %s", exc)
            return []

        history: List[Dict[str, Any]] = []
        for raw_row in rows or []:
            row = _to_dict(raw_row)
            for raw_item in row.get("items") or []:
                item = _to_dict(raw_item)
                item_name = str(item.get("item_name") or "")
                if needle not in _normalize_text(item_name):
                    continue
                history.append(
                    {
                        "date": _format_date(row.get("date")),
                        "product": item_name,
                        "quantity": float(item.get("quantity") or 0),
                        "unit_price": float(item.get("unit_price") or 0),
                        "total_price": float(item.get("total_price") or 0),
                        "description": row.get("description") or "",
                    }
                )

        history.sort(key=lambda item: item.get("date") or "")
        return history

    # ------------------------------------------------------------------
    # Manejadores de las herramientas
    # ------------------------------------------------------------------
    async def _tool_get_summary(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)
        month, error = _normalize_month(args.get("month"))
        if error:
            return _soft_error(error)

        insights = await self.insights.get_insights(context.user_id, scope, month)
        totals = insights.totals
        return {
            "scope": insights.scope,
            "month": insights.month,
            "income": totals.income,
            "expense": totals.expense,
            "balance": totals.balance,
            "savings_rate": totals.savings_rate,
            "transaction_count": totals.transaction_count,
            "prev_month_expense": totals.prev_month_expense,
            "expense_trend_pct": totals.expense_trend_pct,
        }

    async def _tool_get_spend_by_category(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)
        month, error = _normalize_month(args.get("month"))
        if error:
            return _soft_error(error)

        insights = await self.insights.get_insights(context.user_id, scope, month)
        return {
            "scope": insights.scope,
            "month": insights.month,
            "categories": [
                {
                    "category": item.category,
                    "amount": item.amount,
                    "pct_of_total": item.pct_of_total,
                    "trend_vs_last_month": item.trend_vs_last_month,
                }
                for item in insights.by_category
            ],
        }

    async def _tool_get_spend_by_member(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)
        month, error = _normalize_month(args.get("month"))
        if error:
            return _soft_error(error)

        insights = await self.insights.get_insights(context.user_id, scope, month)
        return {
            "scope": insights.scope,
            "month": insights.month,
            "members": [
                {
                    "member": item.member,
                    "amount": item.amount,
                    "transaction_count": item.transaction_count,
                }
                for item in insights.by_member
            ],
        }

    async def _tool_get_budget_status(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)
        month, error = _normalize_month(args.get("month"))
        if error:
            return _soft_error(error)

        insights = await self.insights.get_insights(context.user_id, scope, month)
        return {
            "scope": insights.scope,
            "month": insights.month,
            "budgets": [
                {
                    "category": item.category,
                    "limit": item.amount,
                    "spent": item.spent,
                    "remaining": round(item.amount - item.spent, 2),
                    "percent": item.percent,
                    "status": item.status,
                    "period": item.period,
                }
                for item in insights.budgets
            ],
        }

    async def _tool_get_transactions(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)
        month, error = _normalize_month(args.get("month"))
        if error:
            return _soft_error(error)

        min_amount, error = _optional_number(args.get("min_amount"), "min_amount")
        if error:
            return _soft_error(error)
        max_amount, error = _optional_number(args.get("max_amount"), "max_amount")
        if error:
            return _soft_error(error)
        if (
            min_amount is not None
            and max_amount is not None
            and min_amount > max_amount
        ):
            return _soft_error(
                "'min_amount' no puede ser mayor que 'max_amount'."
            )
        limit, error = _optional_limit(args.get("limit"))
        if error:
            return _soft_error(error)

        category_filter = _normalize_text(args.get("category"))
        member_filter = _normalize_text(args.get("member"))

        try:
            profile = await self.insights_repository.get_user_profile(context.user_id)
        except Exception as exc:
            logger.warning("[chat] No se pudo leer el perfil del usuario: %s", exc)
            return _soft_error("No se pudo consultar el perfil del usuario.")
        family_id = (profile or {}).get("family_id")
        if not family_id:
            return _soft_error("El usuario no pertenece a ninguna familia.")

        try:
            accounts = await self.insights_repository.get_accounts(
                family_id, context.user_id, scope
            )
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer las cuentas: %s", exc)
            return _soft_error("No se pudieron consultar las cuentas.")
        account_ids = [
            str(_to_dict(account).get("id"))
            for account in (accounts or [])
            if _to_dict(account).get("id")
        ]
        if not account_ids:
            return {
                "scope": scope,
                "month": month or "",
                "total": 0,
                "transactions": [],
                "note": "No hay cuentas en el alcance solicitado.",
            }

        year, month_number = parse_month(month)
        start, end = month_bounds(year, month_number)
        fetch_limit = min(
            MAX_TRANSACTIONS_FETCH, max(limit * TRANSACTIONS_FETCH_MULTIPLIER, limit)
        )

        try:
            rows = await self.transactions_repository.get_transactions_prisma(
                family_id, account_ids, start.isoformat(), end.isoformat(), fetch_limit
            )
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer los movimientos: %s", exc)
            return _soft_error("No se pudieron consultar los movimientos.")

        transactions = [_to_dict(row) for row in (rows or [])]
        profiles_map = await self._load_member_names(transactions)

        filtered: List[Dict[str, Any]] = []
        for row in transactions:
            category = _to_dict(row.get("category"))
            category_name = str(category.get("name") or "Sin categoría")
            member_name = profiles_map.get(str(row.get("user_id") or ""), "Sin asignar")
            amount = float(row.get("amount") or 0)

            if category_filter and category_filter not in _normalize_text(category_name):
                continue
            if member_filter:
                if member_filter not in _normalize_text(member_name) and member_filter != _normalize_text(
                    str(row.get("user_id") or "")
                ):
                    continue
            if min_amount is not None and amount < min_amount:
                continue
            if max_amount is not None and amount > max_amount:
                continue

            account = _to_dict(row.get("account"))
            filtered.append(
                {
                    "date": _format_date(row.get("date")),
                    "description": row.get("description") or "",
                    "amount": amount,
                    "type": row.get("type") or "",
                    "category": category_name,
                    "member": member_name,
                    "account": account.get("name") or "Cuenta",
                }
            )
            if len(filtered) >= limit:
                break

        return {
            "scope": scope,
            "month": f"{year:04d}-{month_number:02d}",
            "total": len(filtered),
            "transactions": filtered,
        }

    async def _tool_get_debts(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)

        debts = await self.list_debts(context.user_id)
        return {
            "scope": scope,
            "total": len(debts),
            "debts": [
                {
                    "description": debt.get("description") or "",
                    "type": DEBT_TYPE_LABELS.get(
                        str(debt.get("type") or ""), str(debt.get("type") or "")
                    ),
                    "status": debt.get("status") or "",
                    "total_amount": float(debt.get("total_amount") or 0),
                    "remaining_amount": float(debt.get("remaining_amount") or 0),
                    "due_date": _format_date(debt.get("due_date")) or None,
                }
                for debt in debts
            ],
            "note": "Las deudas siempre son de la familia.",
        }

    async def _tool_get_recurring(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        scope, error = _normalize_scope(args.get("scope"))
        if error:
            return _soft_error(error)

        insights = await self.insights.get_insights(context.user_id, scope, None)
        return {
            "scope": insights.scope,
            "total": len(insights.recurring),
            "recurring": [
                {
                    "merchant": item.merchant,
                    "amount": item.amount,
                    "cadence": item.cadence,
                    "last_seen": item.last_seen,
                    "confidence": item.confidence,
                }
                for item in insights.recurring
            ],
        }

    async def _tool_get_price_history(
        self, context: ToolContext, args: Dict[str, Any]
    ) -> Dict[str, Any]:
        product = args.get("product")
        if not isinstance(product, str) or not product.strip():
            return _soft_error("Debes indicar el producto buscado (parámetro 'product').")

        history = await self.list_price_history(context.user_id, product.strip())
        return {
            "product": product.strip(),
            "total": len(history),
            "history": history,
            "note": (
                "El historial sale de los productos desglosados de los movimientos "
                "registrados."
            ),
        }

    # ------------------------------------------------------------------
    # Auxiliares
    # ------------------------------------------------------------------
    async def _load_member_names(
        self, transactions: List[Dict[str, Any]]
    ) -> Dict[str, str]:
        """Mapa `user_id` -> nombre del miembro (profiles.full_name)."""
        user_ids = sorted(
            {
                str(row.get("user_id"))
                for row in transactions
                if row.get("user_id")
            }
        )
        if not user_ids:
            return {}
        try:
            result = await self.transactions_repository.get_profiles_by_ids(user_ids)
        except Exception as exc:
            logger.warning("[chat] No se pudieron leer los perfiles: %s", exc)
            return {}
        return {
            str(profile.get("id")): (profile.get("full_name") or "Sin asignar")
            for profile in _rows(result)
            if profile.get("id")
        }
