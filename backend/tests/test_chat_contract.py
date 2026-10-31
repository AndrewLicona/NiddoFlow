"""Test de contrato del chat de NiddoAI (CONTRATOS_IMPLEMENTACION.md §5).

No llama a Gemini ni a la base de datos reales: el cliente de Gemini, los
repositorios y la tabla `ai_chat_messages` se sustituyen por dobles en
memoria. Se valida:

  1. El contexto real incluye nombres de categoría y de miembro (D1, D3).
  2. El `spent` de los presupuestos es REAL (nunca $0) (D2) y coincide
     EXACTAMENTE con el que devuelve `GET /budgets/` (§5.1).
  3. Las herramientas del registro son de SOLO LECTURA (§5.2).
  4. La respuesta siempre trae la clave `proposals` (§5.3).
  5. Las tool calls se guardan en `ai_chat_messages.tool_calls` (§5.2).
  6. Hay memoria entre sesiones (§5.4).
  7. Un error de Gemini nunca rompe el flujo (§5.5 / regla 10 de §10).

Ejecución sin pytest:
    cd backend && .\\venv\\Scripts\\python.exe tests\\test_chat_contract.py
"""

import asyncio
import inspect
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

# --- El test debe poder ejecutarse desde cualquier directorio ---------------
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

_ENV_FILE = BACKEND_ROOT / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _value = _line.split("=", 1)
        os.environ.setdefault(
            _key.strip(), _value.strip().strip('"').strip("'").strip("'")
        )
# Si no hay .env (CI), el import de app.db.supabase igual debe funcionar.
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "placeholder-key")

from app.repositories.insights_repository import InsightsRepository  # noqa: E402
from app.services.ai_tools import AITools, TOOL_DECLARATIONS  # noqa: E402
from app.services.budget_period import compute_budget_spent  # noqa: E402
from app.services.budgets_service import BudgetsService  # noqa: E402
from app.services.chat_service import (  # noqa: E402
    MAX_TOOL_ITERATIONS,
    MEMORY_MESSAGES_LIMIT,
    PROPOSAL_MARKER,
    ChatService,
)
from app.services.insights_service import InsightsService  # noqa: E402

# ---------------------------------------------------------------------------
# Datos de prueba
# ---------------------------------------------------------------------------
FAMILY_ID = "fam-1"
USER_ID = "user-1"
OTHER_USER_ID = "user-2"

CATEGORIES = {
    "cat-food": {"id": "cat-food", "name": "Alimentación", "type": "expense"},
    "cat-trans": {"id": "cat-trans", "name": "Transporte", "type": "expense"},
}

ACCOUNTS = [
    {
        "id": "acc-1",
        "name": "Principal",
        "type": "personal",
        "user_id": USER_ID,
        "balance": 2000000.0,
        "family_id": FAMILY_ID,
    },
    {
        "id": "acc-2",
        "name": "Familiar",
        "type": "joint",
        "user_id": None,
        "balance": 1000000.0,
        "family_id": FAMILY_ID,
    },
]

PROFILES = [
    {"id": USER_ID, "full_name": "Andrew Licona", "family_id": FAMILY_ID},
    {"id": OTHER_USER_ID, "full_name": "Jhosep Licona", "family_id": FAMILY_ID},
]

DEBTS = [
    {
        "id": "debt-1",
        "family_id": FAMILY_ID,
        "description": "Prestamo del banco",
        "total_amount": 500000.0,
        "remaining_amount": 250000.0,
        "type": "to_pay",
        "status": "active",
        "due_date": "2026-11-30",
    }
]


def _as_utc(value):
    """Convierte un texto ISO (con o sin zona horaria) a datetime UTC."""
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _tx(tx_id, date, tx_type, amount, category_id, account_id, user_id, description, items=None):
    return {
        "id": tx_id,
        "description": description,
        "amount": amount,
        "type": tx_type,
        "date": datetime(*date, tzinfo=timezone.utc),
        "category_id": category_id,
        "category": CATEGORIES.get(category_id),
        "account_id": account_id,
        "account": {
            "id": account_id,
            "name": next(a["name"] for a in ACCOUNTS if a["id"] == account_id),
            "type": next(a["type"] for a in ACCOUNTS if a["id"] == account_id),
        },
        "user_id": user_id,
        "family_id": FAMILY_ID,
        "items": items or [],
    }


TRANSACTIONS = [
    _tx("t1", (2026, 10, 2, 12), "expense", 300000, "cat-food", "acc-2", USER_ID, "Olimpica",
        [{"id": "i1", "item_name": "Café molido 500g", "quantity": 1.0, "unit_price": 32000.0,
          "total_price": 32000.0, "category": "Alimentación"}]),
    _tx("t2", (2026, 10, 5, 12), "expense", 150000, "cat-food", "acc-1", OTHER_USER_ID, "Homecenter",
        [{"id": "i2", "item_name": "Café molido 500g", "quantity": 2.0, "unit_price": 28000.0,
          "total_price": 56000.0, "category": "Alimentación"}]),
    _tx("t3", (2026, 10, 10, 12), "income", 1000000, None, "acc-1", USER_ID, "Salario"),
    _tx("t4", (2026, 10, 12, 12), "expense", 90000, "cat-trans", "acc-2", OTHER_USER_ID, "Uber"),
    _tx("t5", (2026, 9, 15, 12), "expense", 900000, "cat-food", "acc-2", USER_ID, "Olimpica Sept"),
]

BUDGETS = [
    {
        "id": "b-food",
        "category_id": "cat-food",
        "category": CATEGORIES["cat-food"],
        "family_id": FAMILY_ID,
        "amount": 1000000.0,
        "period": "monthly",
        "month": 10,
        "week_number": None,
        "year": 2026,
        "start_date": None,
        "end_date": None,
        "user_id": None,
    },
    {
        "id": "b-trans",
        "category_id": "cat-trans",
        "category": CATEGORIES["cat-trans"],
        "family_id": FAMILY_ID,
        "amount": 300000.0,
        "period": "monthly",
        "month": 10,
        "week_number": None,
        "year": 2026,
        "start_date": None,
        "end_date": None,
        "user_id": None,
    },
]


# ---------------------------------------------------------------------------
# Dobles de los repositorios (sin base de datos)
# ---------------------------------------------------------------------------
class WriteGuard:
    """Falla si alguien intenta escribir desde una herramienta de solo lectura."""

    WRITE_PREFIXES = ("insert", "update", "delete", "create", "upsert", "patch")

    def __getattr__(self, name):
        if name.startswith(self.WRITE_PREFIXES):
            raise AssertionError(
                f"Una herramienta de solo lectura intentó escribir: {name}"
            )
        raise AttributeError(name)


class FakeInsightsRepository(WriteGuard, InsightsRepository):
    def __init__(self):
        # No se llama a BaseRepository.__init__ a propósito: el test no toca
        # la base de datos real.
        self.db = None
        self.prisma = None

    async def get_user_profile(self, user_id: str):
        return {"id": user_id, "family_id": FAMILY_ID, "full_name": "Andrew Licona"}

    async def get_accounts(self, family_id: str, user_id: str, scope: str = "family"):
        if scope == "personal":
            return [a for a in ACCOUNTS if a.get("user_id") == user_id]
        return [
            a
            for a in ACCOUNTS
            if not a.get("user_id") or str(a.get("user_id")) == str(user_id)
        ]

    async def get_transactions(self, family_id, account_ids, start_date=None, end_date=None):
        allowed = {str(a) for a in account_ids}
        rows = []
        for tx in TRANSACTIONS:
            if str(tx["account_id"]) not in allowed:
                continue
            if start_date and tx["date"] < datetime.fromisoformat(start_date):
                continue
            if end_date and tx["date"] > datetime.fromisoformat(end_date):
                continue
            rows.append(tx)
        return rows

    async def get_budgets(self, family_id: str):
        return [dict(budget) for budget in BUDGETS]

    async def get_profiles(self, user_ids):
        wanted = {str(u) for u in user_ids}
        return [p for p in PROFILES if str(p["id"]) in wanted]


class FakeTransactionsRepository(WriteGuard):
    def __init__(self):
        self.db = None
        self.prisma = None

    async def get_transactions_prisma(
        self, family_id, account_ids, start_date=None, end_date=None, limit=None
    ):
        allowed = {str(a) for a in account_ids}
        rows = []
        for tx in TRANSACTIONS:
            if str(tx["account_id"]) not in allowed:
                continue
            if start_date and tx["date"] < datetime.fromisoformat(start_date):
                continue
            if end_date and tx["date"] > datetime.fromisoformat(end_date):
                continue
            rows.append(dict(tx))
        rows.sort(key=lambda r: r["date"], reverse=True)
        return rows[:limit] if limit else rows

    async def get_profiles_by_ids(self, user_ids):
        wanted = {str(u) for u in user_ids}
        return SimpleNamespace(
            data=[p for p in PROFILES if str(p["id"]) in wanted]
        )

    async def get_categories(self, family_id):
        return SimpleNamespace(data=[dict(c) for c in CATEGORIES.values()])


class FakeDebtsService:
    async def get_debts(self, user_id):
        return [dict(d) for d in DEBTS]


class FakeBudgetsRepository(WriteGuard):
    """Doble del repositorio de presupuestos (para replicar `GET /budgets/`)."""

    def __init__(self):
        self.db = None
        self.prisma = None

    def get_user_profile(self, user_id):
        return SimpleNamespace(data=[{"family_id": FAMILY_ID}])

    def query_budgets(self, filters):
        rows = []
        for budget in BUDGETS:
            if filters.get("family_id") and budget["family_id"] != filters["family_id"]:
                continue
            if "user_id" in filters and budget.get("user_id") != filters["user_id"]:
                continue
            rows.append(dict(budget))
        return SimpleNamespace(data=rows)

    def get_expenses_by_family(self, family_id, start_date=None, end_date=None):
        rows = []
        start = _as_utc(start_date)
        end = _as_utc(end_date)
        for tx in TRANSACTIONS:
            if tx["family_id"] != family_id or tx["type"] != "expense":
                continue
            if start and tx["date"] < start:
                continue
            if end and tx["date"] > end:
                continue
            rows.append(
                {
                    "id": tx["id"],
                    "amount": tx["amount"],
                    "type": tx["type"],
                    "date": tx["date"],
                    "category_id": tx["category_id"],
                    "user_id": tx["user_id"],
                    "family_id": tx["family_id"],
                }
            )
        return SimpleNamespace(data=rows)


# ---------------------------------------------------------------------------
# Dobles de Gemini y de la tabla de mensajes
# ---------------------------------------------------------------------------
class FakeFunctionCall:
    def __init__(self, name, args):
        self.name = name
        self.args = args


class FakeContent:
    def __init__(self, role="model"):
        self.role = role
        self.parts = []


class FakeResponse:
    def __init__(self, text=None, function_calls=None):
        self.text = text
        self.function_calls = function_calls or []
        self.candidates = [SimpleNamespace(content=FakeContent())]


class FakeModels:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    async def generate_content(self, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        if not self._responses:
            raise AssertionError("Se agotaron las respuestas simuladas de Gemini")
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeGeminiClient:
    def __init__(self, responses):
        self.models = FakeModels(responses)
        self.aio = SimpleNamespace(models=self.models)


class FakeMessage:
    def __init__(self, role="user", content="", tool_calls=None):
        self.id = "msg-1"
        self.user_id = USER_ID
        self.role = role
        self.content = content
        self.tool_calls = tool_calls
        self.created_at = datetime(2026, 10, 30, 12, tzinfo=timezone.utc)

    def dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "role": self.role,
            "content": self.content,
            "tool_calls": self.tool_calls,
            "created_at": self.created_at,
        }


class FakeAiChatMessages:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.created = []

    async def create(self, data):
        self.created.append(data)
        return FakeMessage(
            role=data.get("role", "user"),
            content=data.get("content") or "",
            tool_calls=data.get("tool_calls"),
        )

    async def find_many(self, where=None, order=None, take=None):
        rows = list(self.rows)
        if take:
            rows = rows[:take] if str(order or "").find("desc") < 0 else rows[-take:][::-1]
        return rows


class FakePrisma:
    def __init__(self, rows=None):
        self.aichatmessage = FakeAiChatMessages(rows)


# ---------------------------------------------------------------------------
# Constructores de prueba
# ---------------------------------------------------------------------------
def _tools():
    repository = FakeInsightsRepository()
    insights = InsightsService(repository)
    return AITools(
        insights_service=insights,
        insights_repository=repository,
        transactions_repository=FakeTransactionsRepository(),
        debts_service=FakeDebtsService(),
    )


def _service(responses=None, history_rows=None):
    client = FakeGeminiClient(responses if responses is not None else [FakeResponse(text="Hola")])
    return ChatService(
        insights_service=InsightsService(FakeInsightsRepository()),
        insights_repository=FakeInsightsRepository(),
        tools=_tools(),
        gemini_client=client,
        prisma_client=FakePrisma(history_rows),
    )


# ---------------------------------------------------------------------------
# 1) Contexto real: categorías, miembros y `spent` real
# ---------------------------------------------------------------------------
def test_context_includes_category_and_member_names():
    """D1 y D3: el contexto nombra las categorías y los miembros."""
    service = _service()
    context = asyncio.run(service.build_financial_context(USER_ID, "family", "2026-10"))
    text = service.render_financial_context(context)

    # Categorías (antes nunca se imprimían).
    assert "Alimentación" in text
    assert "Transporte" in text
    assert context["by_category"]
    assert context["by_category"][0]["category"] in {"Alimentación", "Transporte"}

    # Miembros (antes el contexto no incluía `profiles.full_name`).
    assert "Andrew Licona" in text
    assert "Jhosep Licona" in text
    members = {item["member"] for item in context["by_member"]}
    assert "Andrew Licona" in members
    assert "Jhosep Licona" in members

    # Y también los totales del mes.
    assert context["totals"]["expense"] == 540000.0
    assert context["totals"]["income"] == 1000000.0
    assert "ingresos" in text and "gastos" in text


def test_context_budget_spent_is_real_and_not_zero():
    """D2: el `spent` que ve la IA nunca es $0."""
    service = _service()
    context = asyncio.run(service.build_financial_context(USER_ID, "family", "2026-10"))

    budgets = {item["category"]: item for item in context["budgets"]}
    assert budgets, "no se devolvieron presupuestos"
    for item in budgets.values():
        assert item["spent"] > 0, f"presupuesto {item} con spent en 0"
        assert item["spent"] <= item["amount"]

    # Alimentación: 300.000 (Olimpica) + 150.000 (Homecenter) de octubre.
    assert budgets["Alimentación"]["spent"] == 450000.0
    assert budgets["Alimentación"]["percent"] == 45.0
    assert budgets["Alimentación"]["status"] == "ok"
    # Transporte: 90.000 de octubre.
    assert budgets["Transporte"]["spent"] == 90000.0

    # El texto del prompt también lo refleja (no un $0).
    text = service.render_financial_context(context)
    assert "450.000" in text
    assert "$0 de $" not in text


def test_spent_seen_by_the_ai_matches_the_budgets_endpoint():
    """Invariante §5.1: el `spent` de la IA == el de `GET /budgets/`."""
    service = _service()
    context = asyncio.run(service.build_financial_context(USER_ID, "family", "2026-10"))

    # Se replica `GET /budgets/` con su propio servicio y repositorio.
    budgets_service = BudgetsService(FakeBudgetsRepository())
    from_budgets = {
        budget["id"]: budget
        for budget in asyncio.run(budgets_service.get_budgets(USER_ID))
    }

    assert from_budgets, "GET /budgets/ no devolvió presupuestos"
    for item in context["budgets"]:
        expected = from_budgets[item["budget_id"]]
        assert item["spent"] == expected["spent"], item
        assert item["amount"] == expected["amount"], item

    # Comprobación adicional con la función compartida `budget_period`.
    shared_spent, shared_percent, _ = compute_budget_spent(
        BUDGETS[0], TRANSACTIONS
    )
    assert shared_spent == 450000.0
    assert shared_percent == 45.0
    assert context["budgets"][0]["spent"] in {b["spent"] for b in from_budgets.values()}


# ---------------------------------------------------------------------------
# 2) Las herramientas son de solo lectura
# ---------------------------------------------------------------------------
def test_tool_registry_never_calls_a_write_method():
    """Ninguna función del registro de tools escribe en la base de datos."""
    source = (BACKEND_ROOT / "app" / "services" / "ai_tools.py").read_text(
        encoding="utf-8"
    )
    forbidden = (
        ".create(",
        ".insert(",
        ".update(",
        ".delete(",
        ".upsert(",
        ".create_many(",
        ".update_many(",
        ".delete_many(",
    )
    for pattern in forbidden:
        assert pattern not in source, f"ai_tools.py usa una escritura: {pattern}"

    # Y el conjunto de herramientas es el del contrato §5.2.
    names = {declaration["name"] for declaration in TOOL_DECLARATIONS}
    assert names == {
        "get_summary",
        "get_spend_by_category",
        "get_spend_by_member",
        "get_budget_status",
        "get_transactions",
        "get_debts",
        "get_recurring",
        "get_price_history",
    }
    assert all(
        declaration["name"].startswith("get_") for declaration in TOOL_DECLARATIONS
    ), "las herramientas de escritura no están permitidas"


def test_all_tools_run_without_writing():
    """Ejecuta las 8 herramientas: ninguna intenta escribir."""
    from app.services.ai_tools import ToolContext

    tools = _tools()
    context = ToolContext(user_id=USER_ID)
    calls = [
        ("get_summary", {"scope": "family", "month": "2026-10"}),
        ("get_spend_by_category", {"scope": "personal", "month": "2026-10"}),
        ("get_spend_by_member", {"scope": "family", "month": "2026-10"}),
        ("get_budget_status", {"scope": "family", "month": "2026-10"}),
        ("get_transactions", {"scope": "family", "month": "2026-10", "limit": 10}),
        ("get_debts", {"scope": "family"}),
        ("get_recurring", {"scope": "family"}),
        ("get_price_history", {"product": "Café"}),
    ]

    for name, args in calls:
        result = asyncio.run(tools.dispatch(name, args, context))
        assert isinstance(result, dict), name
        assert "error" not in result, (name, result)

    # Contenido de algunas herramientas (comprueba que leen de verdad).
    summary = asyncio.run(tools.dispatch("get_summary", {"scope": "family", "month": "2026-10"}, context))
    assert summary["expense"] == 540000.0
    assert summary["income"] == 1000000.0

    by_category = asyncio.run(tools.dispatch("get_spend_by_category", {"scope": "family", "month": "2026-10"}, context))
    assert {item["category"] for item in by_category["categories"]} == {
        "Alimentación",
        "Transporte",
    }

    by_member = asyncio.run(tools.dispatch("get_spend_by_member", {"scope": "family", "month": "2026-10"}, context))
    assert {item["member"] for item in by_member["members"]} == {
        "Andrew Licona",
        "Jhosep Licona",
    }

    budget_status = asyncio.run(tools.dispatch("get_budget_status", {"scope": "family", "month": "2026-10"}, context))
    food = next(b for b in budget_status["budgets"] if b["category"] == "Alimentación")
    assert food["spent"] == 450000.0
    assert food["remaining"] == 550000.0

    debts = asyncio.run(tools.dispatch("get_debts", {"scope": "family"}, context))
    assert debts["total"] == 1
    assert debts["debts"][0]["remaining_amount"] == 250000.0

    transactions = asyncio.run(
        tools.dispatch(
            "get_transactions",
            {"scope": "family", "month": "2026-10", "category": "Alimentación"},
            context,
        )
    )
    assert transactions["total"] == 2
    assert all(item["category"] == "Alimentación" for item in transactions["transactions"])
    assert {item["member"] for item in transactions["transactions"]} == {
        "Andrew Licona",
        "Jhosep Licona",
    }

    prices = asyncio.run(tools.dispatch("get_price_history", {"product": "café"}, context))
    assert prices["total"] == 2
    assert prices["history"][0]["unit_price"] == 32000.0


def test_invalid_tool_arguments_return_a_soft_error():
    """Parámetros inválidos → error suave, nunca una excepción."""
    from app.services.ai_tools import ToolContext

    tools = _tools()
    context = ToolContext(user_id=USER_ID)

    result = asyncio.run(tools.dispatch("get_summary", {"scope": "galaxia"}, context))
    assert "error" in result
    assert "family" in result["error"]

    result = asyncio.run(tools.dispatch("get_summary", {"month": "octubre-2026"}, context))
    assert "error" in result
    assert "YYYY-MM" in result["error"]

    result = asyncio.run(
        tools.dispatch("get_transactions", {"limit": 5000}, context)
    )
    assert "error" in result
    assert "limit" in result["error"]

    result = asyncio.run(
        tools.dispatch("get_transactions", {"min_amount": 500, "max_amount": 100}, context)
    )
    assert "error" in result

    result = asyncio.run(tools.dispatch("get_price_history", {}, context))
    assert "error" in result

    result = asyncio.run(tools.dispatch("herramienta_inexistente", {}, context))
    assert "error" in result


# ---------------------------------------------------------------------------
# 3) Tool calling: el loop, el guardado y el límite de iteraciones
# ---------------------------------------------------------------------------
def test_tool_calls_are_executed_and_persisted():
    """La tool call se resuelve, se usa y se guarda en `tool_calls`."""
    responses = [
        FakeResponse(
            function_calls=[FakeFunctionCall("get_summary", {"scope": "family", "month": "2026-10"})]
        ),
        FakeResponse(text="Este mes gastamos $540.000 en total."),
    ]
    service = _service(responses)
    result = asyncio.run(service.chat_with_assistant(USER_ID, "¿Cuánto gastamos?"))

    assert "reply" in result and "proposals" in result
    assert result["proposals"] == []
    assert "540.000" in result["reply"]

    # Se hicieron 2 llamadas a Gemini (una con la tool y otra final).
    assert len(service.client.models.calls) == 2
    # La primera llevaba las herramientas declaradas.
    config = service.client.models.calls[0]["config"]
    assert config.get("tools")

    # El intercambio quedó guardado en `ai_chat_messages.tool_calls`.
    assistant_messages = [
        row for row in service.prisma.aichatmessage.created if row["role"] == "assistant"
    ]
    assert assistant_messages
    tool_calls = assistant_messages[-1]["tool_calls"]
    assert tool_calls[0]["name"] == "get_summary"
    assert tool_calls[0]["args"]["month"] == "2026-10"
    assert tool_calls[0]["result"]["expense"] == 540000.0


def test_tool_loop_stops_after_max_iterations():
    """El bucle de tool calling tiene un tope de iteraciones."""
    responses = [
        FakeResponse(function_calls=[FakeFunctionCall("get_summary", {"scope": "family"})])
        for _ in range(MAX_TOOL_ITERATIONS + 3)
    ]
    service = _service(responses)
    result = asyncio.run(service.chat_with_assistant(USER_ID, "¿Y ahora?"))

    assert len(service.client.models.calls) == MAX_TOOL_ITERATIONS
    assert "varias veces" in result["reply"]


def test_gemini_failure_never_breaks_the_chat():
    """Un error de Gemini produce un mensaje amable, no una excepción."""
    service = _service([RuntimeError("boom: quota agotada")])
    result = asyncio.run(service.chat_with_assistant(USER_ID, "¿Cuánto gastamos?"))

    assert result["reply"]
    assert "error" not in result["reply"].lower() or "no pude" in result["reply"].lower()
    assert result["proposals"] == []


def test_chat_without_gemini_client_is_friendly():
    """Sin API key configurada el chat responde con cortesía."""
    service = _service([FakeResponse(text="hola")])
    service.clients = []
    service.client = None
    result = asyncio.run(service.chat_with_assistant(USER_ID, "¿Cuánto gastamos?"))
    assert result["proposals"] == []
    assert "no está disponible" in result["reply"]


# ---------------------------------------------------------------------------
# 4) Propuestas (§5.3)
# ---------------------------------------------------------------------------
def test_response_always_contains_the_proposals_key():
    """La respuesta siempre trae `proposals` (array, aunque esté vacío)."""
    service = _service([FakeResponse(text="Hola, ¿en qué te ayudo?")])
    result = asyncio.run(service.chat_with_assistant(USER_ID, "Hola"))

    assert "proposals" in result
    assert isinstance(result["proposals"], list)
    assert result["proposals"] == []
    assert isinstance(result["reply"], str) and result["reply"]


def test_write_intention_produces_a_validated_proposal():
    """'Registra este gasto' genera una propuesta, nunca una escritura."""
    reply = (
        "De acuerdo, te propongo registrar ese café.\n"
        f"{PROPOSAL_MARKER}\n"
        + json.dumps(
            {
                "type": "transaction",
                "label": "Café",
                "payload": {
                    "description": "Café",
                    "amount": 32000,
                    "type": "expense",
                    "category_id": "cat-food",
                    "account_id": "acc-1",
                    "date": "2026-10-30",
                },
            }
        )
    )
    service = _service([FakeResponse(text=reply)])
    result = asyncio.run(
        service.chat_with_assistant(USER_ID, "Registra un café de 32.000 en comida")
    )

    assert len(result["proposals"]) == 1
    proposal = result["proposals"][0]
    assert proposal["type"] == "transaction"
    assert proposal["label"] == "Gasto · Café · $32.000 · Alimentación"
    assert proposal["payload"] == {
        "description": "Café",
        "amount": 32000.0,
        "type": "expense",
        "category_id": "cat-food",
        "account_id": "acc-1",
        "date": "2026-10-30",
    }

    # El marcador técnico no se muestra al usuario.
    assert PROPOSAL_MARKER not in result["reply"]
    assert "te propongo registrar" in result["reply"]

    # La IA NO escribe en `transactions`: solo se guardan los mensajes del chat.
    for row in service.prisma.aichatmessage.created:
        assert "transaction" not in str(row.get("role"))


def test_reply_with_only_the_proposal_block_is_readable():
    """Si el modelo devuelve solo el bloque técnico, el usuario ve texto legible."""
    block = json.dumps(
        {
            "type": "transaction",
            "payload": {
                "description": "Café",
                "amount": 32000,
                "type": "expense",
                "account_id": "acc-1",
                "date": "2026-10-30",
            },
        }
    )
    service = _service([FakeResponse(text=f"{PROPOSAL_MARKER}\n{block}")])
    result = asyncio.run(service.chat_with_assistant(USER_ID, "Registra un café"))

    assert len(result["proposals"]) == 1
    assert PROPOSAL_MARKER not in result["reply"]
    assert "propongo registrar" in result["reply"]


def test_invalid_proposals_are_discarded():
    """Una propuesta sin monto o con datos inválidos no se devuelve."""
    invalid = json.dumps(
        {
            "type": "transaction",
            "payload": {"description": "Café", "amount": -5, "type": "expense"},
        }
    )
    service = _service([FakeResponse(text=f"Listo.\n{PROPOSAL_MARKER}\n{invalid}")])
    result = asyncio.run(service.chat_with_assistant(USER_ID, "Registra un café"))
    assert result["proposals"] == []

    # Una categoría inexistente se descarta (deja category_id en null).
    unknown_category = json.dumps(
        {
            "type": "transaction",
            "payload": {
                "description": "Café",
                "amount": 32000,
                "type": "expense",
                "category_id": "cat-inexistente",
                "account_id": "acc-1",
            },
        }
    )
    service = _service([FakeResponse(text=f"Listo.\n{PROPOSAL_MARKER}\n{unknown_category}")])
    result = asyncio.run(service.chat_with_assistant(USER_ID, "Registra un café"))
    assert len(result["proposals"]) == 1
    assert result["proposals"][0]["payload"]["category_id"] is None


# ---------------------------------------------------------------------------
# 5) Memoria entre sesiones (§5.4)
# ---------------------------------------------------------------------------
def test_memory_is_loaded_from_the_database():
    """Al empezar se cargan los últimos N mensajes del usuario."""
    rows = [
        FakeMessage(role="user", content="¿Cuánto gasté en comida?"),
        FakeMessage(role="assistant", content="Gastaste $450.000 en Alimentación."),
    ]
    service = _service([FakeResponse(text="De nada.")], history_rows=rows)
    result = asyncio.run(service.chat_with_assistant(USER_ID, "¿Y en transporte?"))

    contents = service.client.models.calls[0]["contents"]
    texts = [
        part["text"]
        for entry in contents
        if isinstance(entry, dict)
        for part in entry["parts"]
    ]
    assert "¿Cuánto gasté en comida?" in texts
    assert "Gastaste $450.000 en Alimentación." in texts
    assert texts[-1] == "¿Y en transporte?"
    assert result["reply"] == "De nada."

    # El límite de memoria es 20 mensajes.
    assert MEMORY_MESSAGES_LIMIT == 20


def test_client_history_is_used_when_there_is_no_memory():
    """Si la BD no tiene mensajes, se usa el historial que envía el navegador."""
    service = _service([FakeResponse(text="ok")])
    asyncio.run(
        service.chat_with_assistant(
            USER_ID, "hola", [{"role": "user", "content": "mensaje previo"}]
        )
    )
    contents = service.client.models.calls[0]["contents"]
    texts = [
        part["text"]
        for entry in contents
        if isinstance(entry, dict)
        for part in entry["parts"]
    ]
    assert "mensaje previo" in texts


# ---------------------------------------------------------------------------
# 6) Contrato del endpoint
# ---------------------------------------------------------------------------
def test_chat_router_contract():
    """`POST /api/chat/message` devuelve `{reply, proposals}`."""
    from app.routers.chat import ChatMessageRequest, ChatMessageResponse

    request = ChatMessageRequest(message="hola", history=[])
    assert request.message == "hola"

    response = ChatMessageResponse(reply="hola")
    assert response.proposals == []

    payload = ChatMessageResponse(reply="hola", proposals=[]).model_dump()
    assert set(payload.keys()) == {"reply", "proposals"}
    assert payload["proposals"] == []


def test_service_exposes_the_documented_public_api():
    """La API pública del servicio no cambió de forma inesperada."""
    assert hasattr(ChatService, "chat_with_assistant")
    assert hasattr(ChatService, "get_user_financial_context")
    assert hasattr(ChatService, "get_chat_history")
    assert hasattr(ChatService, "load_memory")
    assert "user_id" in inspect.signature(ChatService.chat_with_assistant).parameters


if __name__ == "__main__":
    failures = 0
    for name, func in sorted(globals().items()):
        if name.startswith("test_") and callable(func):
            try:
                func()
                print(f"OK   {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
            except Exception as exc:  # pragma: no cover
                failures += 1
                print(f"ERROR {name}: {type(exc).__name__}: {exc}")
    print("\n" + ("TODO OK" if failures == 0 else f"{failures} FALLOS"))
    sys.exit(1 if failures else 0)
