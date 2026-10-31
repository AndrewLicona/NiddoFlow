import logging
import re
import unicodedata
from datetime import datetime
from typing import List, Optional, Tuple

from app.repositories.categories_repository import CategoriesRepository
from app.services.base import BaseService
from app.services.category_icons import normalize_icon
from app.services.category_keywords import CATEGORY_ALIASES, CATEGORY_KEYWORDS

logger = logging.getLogger(__name__)

# --- Constantes de normalizacion --------------------------------------------

# Preposiciones/articulos que se quitan del PRINCIPIO de un texto para
# compararlo contra el nombre de una categoria ("de la comida" -> "comida").
LEADING_PREPOSITIONS = {"de", "del", "la", "el", "los", "las", "un", "una"}

# Tipos de categoria admitidos (los budgets y el dashboard asumen estos dos).
CATEGORY_TYPES = ("income", "expense")

# Tope de filas del detalle del impacto. Los conteos siempre traen el total
# real, aunque la lista este truncada.
IMPACT_LIMIT = 50


class CategoryServiceError(Exception):
    """Error de dominio de categorias. El router lo traduce a un status HTTP."""

    status_code = 400

    def __init__(self, message: str, **extra):
        super().__init__(message)
        self.message = message
        self.extra = extra


class CategoryValidationError(CategoryServiceError):
    status_code = 400


class CategoryPermissionError(CategoryServiceError):
    status_code = 403


class CategoryNotFoundError(CategoryServiceError):
    status_code = 404


class CategoryConflictError(CategoryServiceError):
    status_code = 409


# --- Funciones puras de normalizacion (testeables sin base de datos) ---------

def strip_accents(text: str) -> str:
    """Elimina las tildes: "Préstamos" -> "Prestamos"."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def fold(text: Optional[str]) -> str:
    """Minusculas, sin tildes, sin puntuacion y con espacios colapsados.

    Es la forma usada para EXACTO y para ALIAS.
    """
    if not text:
        return ""
    without_accents = strip_accents(str(text)).lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", without_accents)
    return re.sub(r"\s+", " ", cleaned).strip()


def singularize(word: str) -> str:
    """Singularizacion simple: terminacion "es" -> "" y "s" -> "".

    Se aplica igual a los dos lados de la comparacion, de modo que
    "Comidas" y "Comida" terminan en la misma forma.
    """
    if len(word) > 4 and word.endswith("es"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s"):
        return word[:-1]
    return word


def tokens_match(a: str, b: str) -> bool:
    """True si dos palabras son la misma, ignorando singular/plural.

    Simetrica: "comida"/"comidas", "alquiler"/"alquileres",
    "interes"/"intereses" y "carne"/"carnes" emparejan en los dos sentidos.
    """
    if a == b:
        return True
    if singularize(a) == b:
        return True
    if singularize(b) == a:
        return True
    # Sufijos plurales añadidos: "carnes" == "carne" + "s".
    if a == b + "s" or b == a + "s":
        return True
    return False


def normalize_phrase(text: Optional[str]) -> str:
    """Forma normalizada: sin tildes, sin preposiciones iniciales y con
    espacios colapsados. Es la base del paso (4).

    La singularizacion NO se aplica aqui (destruiria informacion de forma
    asimetrica); la comparacion de palabras se hace con ``tokens_match``.
    """
    tokens = fold(text).split()
    while tokens and tokens[0] in LEADING_PREPOSITIONS:
        tokens.pop(0)
    return " ".join(tokens)


def _word_pattern(keyword: str) -> re.Pattern:
    """Compila un keyword como expresion regular de palabra completa."""
    return re.compile(r"(?<!\w)" + re.escape(keyword) + r"(?!\w)")


def _category_name(category) -> str:
    """Extrae el nombre de una categoria, sea dict u objeto."""
    if isinstance(category, dict):
        return category.get("name") or ""
    return getattr(category, "name", "") or ""


def _category_id(category) -> Optional[str]:
    if isinstance(category, dict):
        value = category.get("id")
    else:
        value = getattr(category, "id", None)
    return str(value) if value is not None else None


def _category_family_id(category) -> Optional[str]:
    """``family_id`` de la categoria (None en las categorias por defecto)."""
    if isinstance(category, dict):
        value = category.get("family_id")
    else:
        value = getattr(category, "family_id", None)
    return str(value) if value is not None else None


class CategoriesService(BaseService):
    def __init__(self, repository: CategoriesRepository):
        super().__init__(repository)

    # ------------------------------------------------------------------
    # Lectura
    # ------------------------------------------------------------------

    async def get_categories(self, user_id: str):
        """Categorias por defecto + categorias propias de la familia.

        NO se cambia el comportamiento: el frontend depende de esta forma.
        """
        profile_res = self.repository.get_user_profile(user_id)
        family_id = profile_res.data[0].get('family_id') if profile_res.data else None

        res = self.repository.get_categories(family_id)
        return res.data or []

    async def _get_family_id(self, user_id: str) -> Optional[str]:
        profile_res = self.repository.get_user_profile(user_id)
        if not profile_res.data or not profile_res.data[0].get('family_id'):
            return None
        return profile_res.data[0]['family_id']

    async def _get_visible_categories(self, family_id: Optional[str]) -> List[dict]:
        res = self.repository.get_categories(family_id)
        return res.data or []

    async def get_family_context(self, user_id: str) -> Tuple[Optional[str], List[dict]]:
        """Contexto de la familia del usuario: ``(family_id, categorias)``.

        Lo usan los routers que necesitan las categorías visibles (por ejemplo
        el OCR) sin tocar la base de datos desde la capa HTTP: el router solo
        valida y delega.
        """
        return await self.repository.get_family_context(user_id)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_category(self, user_id: str, category_data: dict) -> dict:
        """Crea una categoria propia de la familia del usuario.

        El ``family_id`` SIEMPRE viene del perfil del usuario, nunca del body
        (anti-abuso multi-familia, contrato 3.2).
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise CategoryValidationError("El usuario no pertenece a una familia")

        name = self._clean_name(category_data.get('name'))
        category_type = (category_data.get('type') or '').strip().lower()
        if category_type not in CATEGORY_TYPES:
            raise CategoryValidationError(
                "El tipo de la categoria debe ser 'income' o 'expense'"
            )

        icon = normalize_icon(category_data.get('icon'))

        await self._ensure_unique_name(family_id, category_type, name)

        payload = {
            "name": name,
            "type": category_type,
            "icon": icon,
            "is_default": False,
            "family_id": family_id,
        }

        res = self.repository.insert_category(payload)
        if not res.data:
            raise CategoryServiceError("No se pudo crear la categoria")
        return res.data[0]

    async def update_category(self, user_id: str, category_id: str, updates: dict) -> dict:
        """Renombra o cambia el icono de una categoria propia.

        Prohibido tocar categorias por defecto (403) o de otra familia (403).
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise CategoryValidationError("El usuario no pertenece a una familia")

        category = self._get_category_or_404(category_id)
        self._assert_editable(category, family_id)

        payload = {}
        if updates.get('name') is not None:
            name = self._clean_name(updates.get('name'))
            await self._ensure_unique_name(
                family_id, category['type'], name, exclude_id=category_id
            )
            payload["name"] = name
        if 'icon' in updates:
            payload["icon"] = normalize_icon(updates.get('icon'))

        if not payload:
            return category

        res = self.repository.update_category(category_id, family_id, payload)
        if not res.data:
            raise CategoryNotFoundError("Categoria no encontrada")
        return res.data[0]

    async def delete_category(self, user_id: str, category_id: str) -> dict:
        """Borra una categoria propia y reporta lo que queda sin categoria.

        NO se borra historial: las referencias se ponen en NULL y los
        movimientos, presupuestos, productos y deudas se conservan.
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise CategoryValidationError("El usuario no pertenece a una familia")

        category = self._get_category_or_404(category_id)
        self._assert_editable(category, family_id)

        transactions_affected = self.repository.count_transactions_by_category(category_id)
        budgets_affected = self.repository.count_budgets_by_category(category_id)
        items_affected = self.repository.count_items_by_category(category_id)
        debts_affected = self.repository.count_debts_by_category(category_id)

        # El detalle se lee ANTES de desvincular: en la base de datos las
        # referencias se ponen en NULL (y el ON DELETE SET NULL tambien), asi
        # que despues ya no quedaria nada que listar.
        affected = self._collect_affected(
            category_id,
            transactions_affected,
            budgets_affected,
            items_affected,
            debts_affected,
        )

        # Desvinculamos los presupuestos ANTES de borrar. Depende de que
        # `budgets.category_id`admita NULL (migracion de esquema del agente G);
        # si todavia no admite NULL, abortamos el borrado en vez de dejar que
        # el ON DELETE CASCADE se lleve el presupuesto.
        if budgets_affected:
            if not self._detach_budgets(category_id):
                raise CategoryConflictError(
                    "No se puede eliminar la categoria: hay presupuestos asociados "
                    "y el esquema todavia no permite conservarlos sin categoria",
                    budgets_affected=budgets_affected,
                )

        self._detach_transactions(category_id)
        self._detach_items(category_id)
        # Las deudas se desvinculan con el mismo patron defensivo: si la
        # columna `debts.category_id` todavia no admite NULL, se avisa y se
        # sigue (el borrado no debe fallar por deudas asociadas).
        self._detach_debts(category_id)

        try:
            res = self.repository.delete_category(category_id, family_id)
        except Exception as exc:
            # Una FK puede bloquear el borrado (p.ej. `debts.category_id`, que en
            # el esquema actual sigue en ON DELETE NO ACTION). No se pierde nada:
            # se responde 409 con un mensaje claro en vez de un 500 con el error
            # crudo de Postgres.
            logger.warning("No se pudo borrar la categoria %s: %s", category_id, exc)
            raise CategoryConflictError(
                "La categoria esta siendo usada por otros registros "
                "y no puede eliminarse",
                category_id=str(category_id),
            )
        if not res.data:
            raise CategoryNotFoundError("Categoria no encontrada")

        message = "Los movimientos quedaran sin categoria."
        if budgets_affected:
            message += " El presupuesto se conservara sin categoria."
        if items_affected:
            message += " Los productos de factura quedaran sin categoria."
        if debts_affected:
            message += " Las deudas quedaran sin categoria."

        return {
            "deleted": True,
            "warnings": {
                "transactions_affected": transactions_affected,
                "budgets_affected": budgets_affected,
                "items_affected": items_affected,
                "debts_affected": debts_affected,
                "message": message,
                # Misma forma que GET /categories/{id}/impact.
                "affected": affected,
            },
        }

    # ------------------------------------------------------------------
    # Impacto y reasignacion
    # ------------------------------------------------------------------

    async def get_category_impact(self, user_id: str, category_id: str) -> dict:
        """Detalle de lo que usa una categoría. NO escribe nada.

        403 si la categoría es por defecto o es de otra familia.
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise CategoryValidationError("El usuario no pertenece a una familia")

        category = self._get_category_or_404(category_id)
        self._assert_editable(category, family_id)

        counts = {
            "transactions": self.repository.count_transactions_by_category(category_id),
            "budgets": self.repository.count_budgets_by_category(category_id),
            "items": self.repository.count_items_by_category(category_id),
            "debts": self.repository.count_debts_by_category(category_id),
        }

        affected = self._collect_affected(
            category_id,
            counts["transactions"],
            counts["budgets"],
            counts["items"],
            counts["debts"],
        )

        return {
            "category": {
                "id": str(category.get("id")),
                "name": category.get("name"),
                "type": category.get("type"),
            },
            "counts": counts,
            "transactions": affected["transactions"],
            "budgets": affected["budgets"],
            "items": affected["items"],
            "debts": affected["debts"],
        }

    async def reassign_category(
        self, user_id: str, category_id: str, target_category_id: str
    ) -> dict:
        """Mueve todo lo que apunta a la categoría origen hacia la destino.

        - La origen debe ser propia de la familia del usuario (403).
        - La destino debe ser visible (por defecto o de su familia) y de tipo
          compatible (400).
        - Mover a la misma categoría es un no-op (400).
        """
        family_id = await self._get_family_id(user_id)
        if not family_id:
            raise CategoryValidationError("El usuario no pertenece a una familia")

        if not target_category_id:
            raise CategoryValidationError("La categoria destino es obligatoria")

        category = self._get_category_or_404(category_id)
        self._assert_editable(category, family_id)

        if str(target_category_id) == str(category_id):
            raise CategoryValidationError(
                "La categoria destino debe ser distinta de la categoria origen"
            )

        target = self._get_category_or_404(target_category_id)

        # La destino tiene que ser visible para el usuario: por defecto o de
        # su familia. Una categoría de otra familia es un intento fuera de
        # alcance (403).
        if not target.get("is_default") and str(target.get("family_id")) != str(family_id):
            raise CategoryPermissionError(
                "No puedes mover registros a una categoria de otra familia"
            )

        # Tipo compatible: un gasto no se puede convertir en ingreso.
        origin_type = (category.get("type") or "").lower()
        target_type = (target.get("type") or "").lower()
        if origin_type != target_type:
            raise CategoryValidationError(
                "No se puede mover una categoria de tipo "
                f"'{origin_type}' a una de tipo '{target_type}'"
            )

        moved = self.repository.reassign_category(
            str(category_id), str(family_id), str(target_category_id)
        )
        return {"moved": moved}

    def _collect_affected(
        self,
        category_id: str,
        transactions_affected: int,
        budgets_affected: int,
        items_affected: int,
        debts_affected: int,
    ) -> dict:
        """Detalle (truncado) de lo que apunta a la categoría.

        Solo se consulta cada lista si hay algo que mostrar: si el conteo es 0
        la lista va vacía y no se gasta una consulta.
        """
        transactions = []
        if transactions_affected:
            transactions = self.repository.list_transactions_by_category(
                category_id, limit=IMPACT_LIMIT
            )

        budgets = []
        if budgets_affected:
            budgets = self.repository.list_budgets_by_category(
                category_id, limit=IMPACT_LIMIT
            )

        items = []
        if items_affected:
            items = self.repository.list_items_by_category(
                category_id, limit=IMPACT_LIMIT
            )

        debts = []
        if debts_affected:
            debts = self.repository.list_debts_by_category(
                category_id, limit=IMPACT_LIMIT
            )

        return {
            "transactions": transactions or [],
            "budgets": budgets or [],
            "items": items or [],
            "debts": debts or [],
        }

    # ------------------------------------------------------------------
    # Reglas aprendidas (user_category_rules)
    # ------------------------------------------------------------------

    async def create_category_rule(
        self, user_id: str, merchant: str, raw_keyword: str, category: str
    ) -> dict:
        """Crea (o actualiza) la regla aprendida de un usuario.

        - ``merchant`` y ``raw_keyword`` se normalizan (trim, minusculas, sin
          espacios dobles).
        - ``category`` debe ser el NOMBRE de una categoria existente.
        - ``user_id`` sale del token, nunca del body.
        """
        family_id = await self._get_family_id(user_id)

        normalized_merchant = self._normalize_rule_text(merchant)
        normalized_keyword = self._normalize_rule_text(raw_keyword)
        if not normalized_merchant:
            raise CategoryValidationError("El comercio es obligatorio")
        if not normalized_keyword:
            raise CategoryValidationError("La palabra clave es obligatoria")

        category_name = (category or "").strip()
        if not category_name:
            raise CategoryValidationError("La categoria es obligatoria")

        visible = await self._get_visible_categories(family_id)
        target = None
        for candidate in visible:
            if fold(_category_name(candidate)) == fold(category_name):
                target = candidate
                break
        if target is None:
            raise CategoryValidationError(
                f"La categoria '{category_name}' no existe"
            )

        payload = {
            "user_id": str(user_id),
            "family_id": family_id,
            "merchant": normalized_merchant,
            "raw_keyword": normalized_keyword,
            "category": _category_name(target),
            "updated_at": datetime.utcnow().isoformat(),
        }

        res = self.repository.upsert_category_rule(payload)
        if not res.data:
            raise CategoryServiceError("No se pudo guardar la regla")
        return res.data[0]

    async def get_category_rules(self, user_id: str, merchant: Optional[str] = None) -> List[dict]:
        """Lista las reglas aprendidas del usuario, opcionalmente por comercio."""
        normalized_merchant = self._normalize_rule_text(merchant) if merchant else None
        res = self.repository.get_category_rules(str(user_id), normalized_merchant)
        return res.data or []

    # ------------------------------------------------------------------
    # Matcher (contrato 3.4)
    # ------------------------------------------------------------------

    def match_category(
        self, raw_text: Optional[str], categories: List[dict]
    ) -> Tuple[Optional[str], Optional[str]]:
        """Devuelve (category_id, matched_category_name).

        Orden de resolucion:
          1. Reglas aprendidas (user_category_rules) -> se consulta en el
             servicio, no aqui (ver ``match_category_with_rules``).
          2. Coincidencia EXACTA (case-insensitive, sin tildes).
          3. Alias registrados para la categoria.
          4. Normalizacion: sin tildes, singular/plural, preposiciones.
          5. Mapa de keywords (el que ya existe en ocr_service.py).
          6. Sin match -> (None, None)

        NO inventa categorias que no esten en ``categories``.
        """
        if not raw_text or not categories:
            return (None, None)

        # `entries` conserva el registro completo para poder preferir la
        # categoria propia de la familia frente a la categoria por defecto.
        entries = []
        for category in categories:
            name = _category_name(category)
            if not name:
                continue
            entries.append({
                "id": _category_id(category),
                "name": name,
                "family_id": _category_family_id(category),
            })
        if not entries:
            return (None, None)

        folded_text = fold(raw_text)
        if not folded_text:
            return (None, None)

        # (2) EXACTO: case-insensitive y sin tildes.
        for entry in entries:
            if fold(entry["name"]) == folded_text:
                return (entry["id"], entry["name"])

        # (3) ALIAS: concepto -> nombres canonicos de categoria.
        alias_hit = self._match_alias(folded_text, entries)
        if alias_hit:
            return alias_hit

        # (4) NORMALIZACION: sin tildes, singular/plural, preposiciones.
        normalized_text = normalize_phrase(raw_text)
        if normalized_text:
            text_tokens = normalized_text.split()

            # 4a. La categoria completa coincide con el texto.
            best = None
            for entry in entries:
                name_tokens = normalize_phrase(entry["name"]).split()
                if not name_tokens:
                    continue
                if len(name_tokens) == len(text_tokens) and all(
                    tokens_match(a, b) for a, b in zip(text_tokens, name_tokens)
                ):
                    if best is None or self._is_preferred(entry, best):
                        best = entry
            if best:
                return (best["id"], best["name"])

            # 4b. La categoria aparece dentro del texto.
            best = None
            for entry in entries:
                name_tokens = normalize_phrase(entry["name"]).split()
                if not name_tokens:
                    continue
                if self._contains_tokens(text_tokens, name_tokens):
                    if best is None or self._is_preferred(entry, best):
                        best = entry
            if best:
                return (best["id"], best["name"])

        # (5) KEYWORDS: mapa heredado del OCR.
        keyword_hit = self._match_keywords(folded_text, entries)
        if keyword_hit:
            return keyword_hit

        # (6) Sin match.
        return (None, None)

    async def match_category_with_rules(
        self,
        user_id: str,
        raw_text: Optional[str],
        categories: List[dict],
        merchant: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """Igual que ``match_category`` pero consulta primero las reglas
        aprendidas del usuario (paso 1 del contrato 3.4)."""
        if not raw_text or not categories:
            return (None, None)

        rule_hit = await self._match_user_rules(user_id, raw_text, categories, merchant)
        if rule_hit:
            return rule_hit

        return self.match_category(raw_text, categories)

    # ------------------------------------------------------------------
    # Items de factura -> categoria real (contrato 6.2)
    # ------------------------------------------------------------------

    async def persist_item_categories(self, transaction_id: str, items: List[dict]) -> None:
        """Fija ``category_id`` (y ``confidence``) en los items de una transaccion.

        La usa ``transactions_service`` despues de insertar los items: el
        insert guarda el TEXTO de la categoria, y este paso lo convierte en la
        categoria real. Si el item trae ``category`` (texto) pero no
        ``category_id``, se resuelve con el matcher contra las categorias de la
        familia de la transaccion.

        Los items se emparejan por nombre y cantidad, en el mismo orden en que
        se insertaron.

        Nunca revienta: si la columna ``transaction_items.category_id`` todavia
        no existe (migracion pendiente) solo se registra un aviso.
        """
        if not items:
            return

        try:
            res = self.repository.get_transaction_items(transaction_id)
            rows = res.data or []
        except Exception as exc:  # pragma: no cover - depende del esquema
            logger.warning(
                "No se pudieron leer los items de la transaccion %s: %s",
                transaction_id,
                exc,
            )
            return

        if not rows:
            return

        # Categorias de la familia de la transaccion, para resolver textos.
        family_id = None
        categories: List[dict] = []
        try:
            tx_family = self.repository.get_transaction_family(transaction_id)
            family_id = tx_family.get('family_id') if tx_family else None
            categories = await self._get_visible_categories(family_id)
        except Exception as exc:  # pragma: no cover - depende del esquema
            logger.warning("No se pudieron leer las categorias de la familia: %s", exc)

        used = set()
        for item in items:
            item_dict = item if isinstance(item, dict) else getattr(item, "__dict__", {})
            category_id = item_dict.get('category_id') or item_dict.get('categoryId')
            confidence = item_dict.get('confidence')

            if category_id is None and categories:
                # El OCR solo devolvio el TEXTO de la categoria: lo resolvemos.
                raw_text = item_dict.get('category')
                if raw_text:
                    resolved_id, _ = self.match_category(raw_text, categories)
                    category_id = resolved_id

            if category_id is None and confidence is None:
                continue

            row = self._match_item_row(rows, item_dict, used)
            if row is None:
                continue

            try:
                self.repository.update_transaction_item_category(
                    row['id'], str(category_id) if category_id is not None else None, confidence
                )
                used.add(row['id'])
            except Exception as exc:  # pragma: no cover - depende del esquema
                logger.warning(
                    "No se pudo asignar la categoria al item %s: %s", row.get('id'), exc
                )
                return

    # ------------------------------------------------------------------
    # Utilidades internas
    # ------------------------------------------------------------------

    def _clean_name(self, name: Optional[str]) -> str:
        cleaned = re.sub(r"\s+", " ", (name or "").strip())
        if not cleaned:
            raise CategoryValidationError("El nombre de la categoria es obligatorio")
        return cleaned

    def _normalize_rule_text(self, text: Optional[str]) -> str:
        """trim + minusculas + sin espacios dobles."""
        return re.sub(r"\s+", " ", (text or "").strip().lower())

    def _get_category_or_404(self, category_id: str) -> dict:
        res = self.repository.get_category_by_id(str(category_id))
        if not res.data:
            raise CategoryNotFoundError("Categoria no encontrada")
        return res.data[0]

    def _assert_editable(self, category: dict, family_id: str) -> None:
        """403 si es por defecto o si pertenece a otra familia."""
        if category.get('is_default'):
            raise CategoryPermissionError(
                "No se pueden modificar ni eliminar las categorias por defecto"
            )
        if str(category.get('family_id')) != str(family_id):
            raise CategoryPermissionError(
                "No tienes permiso para modificar esta categoria"
            )

    async def _ensure_unique_name(
        self, family_id: str, category_type: str, name: str, exclude_id: Optional[str] = None
    ) -> None:
        """409 si ya existe una categoria de la familia con el mismo nombre
        (ignorando mayusculas, espacios y tildes) y el mismo tipo."""
        visible = await self._get_visible_categories(family_id)
        target = fold(name)
        for category in visible:
            if exclude_id and str(category.get('id')) == str(exclude_id):
                continue
            if category.get('family_id') is None:
                # Las categorias por defecto viven en otra "familia" (family_id NULL).
                continue
            if str(category.get('family_id')) != str(family_id):
                continue
            if (category.get('type') or '').lower() != category_type:
                continue
            if fold(category.get('name')) == target:
                raise CategoryConflictError(
                    f"Ya existe una categoria '{category.get('name')}' "
                    f"de tipo '{category_type}' (id: {category.get('id')})",
                    existing_id=str(category.get('id')),
                    existing_name=category.get('name'),
                )

    def _detach_budgets(self, category_id: str) -> bool:
        """Pone en NULL ``budgets.category_id``. False si el esquema no lo permite."""
        try:
            self.repository.db.table("budgets").update(
                {"category_id": None}
            ).eq("category_id", category_id).execute()
            return True
        except Exception as exc:
            logger.warning("No se pudieron desvincular los presupuestos: %s", exc)
            return False

    def _detach_transactions(self, category_id: str) -> None:
        try:
            self.repository.db.table("transactions").update(
                {"category_id": None}
            ).eq("category_id", category_id).execute()
        except Exception as exc:  # pragma: no cover
            logger.warning("No se pudieron desvincular los movimientos: %s", exc)

    def _detach_items(self, category_id: str) -> None:
        try:
            self.repository.db.table("transaction_items").update(
                {"category_id": None}
            ).eq("category_id", category_id).execute()
        except Exception as exc:  # pragma: no cover - la columna puede no existir aun
            logger.warning("No se pudieron desvincular los productos: %s", exc)

    def _detach_debts(self, category_id: str) -> None:
        """Pone en NULL ``debts.category_id``. Nunca borra deudas.

        Mismo patron defensivo que el resto: si la columna todavia no admite
        NULL (migracion pendiente) se registra un aviso y se sigue, para que el
        borrado de la categoria nunca falle por deudas asociadas.
        """
        try:
            self.repository.db.table("debts").update(
                {"category_id": None}
            ).eq("category_id", category_id).execute()
        except Exception as exc:  # pragma: no cover - depende del esquema
            logger.warning("No se pudieron desvincular las deudas: %s", exc)

    def _match_alias(self, folded_text: str, entries: List[dict]) -> Optional[Tuple[Optional[str], str]]:
        """(3) Resuelve un alias contra las categorias disponibles."""
        for alias, canonical_names in CATEGORY_ALIASES.items():
            alias_folded = fold(alias)
            if not alias_folded:
                continue
            if not _word_pattern(alias_folded).search(folded_text):
                continue

            canonical_folded = {fold(canonical) for canonical in canonical_names}
            candidates = [e for e in entries if fold(e["name"]) in canonical_folded]
            if not candidates:
                continue

            # Se prefiere la categoria mas especifica de la familia.
            preferred = [e for e in candidates if e["family_id"] is not None]
            best = (preferred or candidates)[0]
            return (best["id"], best["name"])
        return None

    def _match_keywords(self, folded_text: str, entries: List[dict]) -> Optional[Tuple[Optional[str], str]]:
        """(5) Mapa de keywords heredado de ocr_service.py."""
        best = None
        best_length = 0
        for canonical_name, keywords in CATEGORY_KEYWORDS.items():
            folded_canonical = fold(canonical_name)
            matches = [e for e in entries if fold(e["name"]) == folded_canonical]
            if not matches:
                continue

            for keyword in keywords:
                folded_keyword = fold(keyword)
                if not folded_keyword:
                    continue
                if not _word_pattern(folded_keyword).search(folded_text):
                    continue
                if len(folded_keyword) > best_length:
                    best_length = len(folded_keyword)
                    preferred = [m for m in matches if m["family_id"] is not None]
                    chosen = (preferred or matches)[0]
                    best = (chosen["id"], chosen["name"])
                break
        return best

    async def _match_user_rules(
        self,
        user_id: str,
        raw_text: Optional[str],
        categories: List[dict],
        merchant: Optional[str] = None,
    ) -> Optional[Tuple[Optional[str], Optional[str]]]:
        """(1) Reglas aprendidas del usuario (user_category_rules)."""
        try:
            rules = await self.get_category_rules(user_id, merchant)
        except Exception as exc:  # pragma: no cover - depende del esquema
            logger.warning("No se pudieron leer las reglas aprendidas: %s", exc)
            return None

        if not rules:
            return None

        folded_text = fold(raw_text)
        normalized_merchant = fold(merchant) if merchant else None

        for rule in rules:
            rule_merchant = fold(rule.get('merchant'))
            if normalized_merchant and rule_merchant and rule_merchant != normalized_merchant:
                continue
            keyword = fold(rule.get('raw_keyword'))
            if not keyword:
                continue
            if not _word_pattern(keyword).search(folded_text):
                continue

            rule_category = rule.get('category') or ""
            for category in categories:
                if fold(_category_name(category)) == fold(rule_category):
                    return (_category_id(category), _category_name(category))
        return None

    def _match_item_row(self, rows: List[dict], item: dict, used: set) -> Optional[dict]:
        """Empareja un item del body con la fila ya insertada en la BD."""
        item_name = (item.get('item_name') or item.get('itemName') or "")
        quantity = item.get('quantity', 1.0)

        for row in rows:
            if row.get('id') in used:
                continue
            if (row.get('item_name') or "") != item_name:
                continue
            try:
                if float(row.get('quantity') or 0) != float(quantity or 0):
                    continue
            except (TypeError, ValueError):
                pass
            return row

        for row in rows:
            if row.get('id') in used:
                continue
            if (row.get('item_name') or "") == item_name:
                return row

        return None

    def _is_preferred(self, entry: dict, current_best: dict) -> bool:
        """True si ``entry`` es mas especifica que ``current_best``.

        Se prefiere la categoria propia de la familia frente a la categoria
        por defecto (que tiene ``family_id = NULL``).
        """
        if current_best.get("family_id") is None and entry.get("family_id") is not None:
            return True
        return False

    def _contains_tokens(self, text_tokens: List[str], name_tokens: List[str]) -> bool:
        """True si la secuencia ``name_tokens`` aparece dentro de ``text_tokens``.

        La comparacion es palabra a palabra y tolera singular/plural.
        """
        if not name_tokens or len(name_tokens) > len(text_tokens):
            return False
        for start in range(len(text_tokens) - len(name_tokens) + 1):
            window = text_tokens[start:start + len(name_tokens)]
            if all(tokens_match(a, b) for a, b in zip(window, name_tokens)):
                return True
        return False


async def persist_item_categories(transaction_id: str, items: List[dict]) -> None:
    """Atajo de modulo para que otros servicios la integren en una linea.

    Equivale a ``CategoriesService(CategoriesRepository()).persist_item_categories(...)``
    pero evita que el llamador tenga que construir el servicio.
    """
    service = CategoriesService(CategoriesRepository())
    await service.persist_item_categories(transaction_id, items)
