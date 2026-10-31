"""Prueba de integracion contra la BD real del CRUD de categorias.

No forma parte de la suite de pytest (toca la base de datos de produccion).
Se ejecuta a mano:

    cd backend
    .\\venv\\Scripts\\python.exe _tmp_integration_categories.py
"""

import asyncio
import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND, ".env"))

# Este script toca la BASE DE DATOS REAL: crea y borra filas de prueba.
# Para evitar borrados accidentales, exige un opt-in explicito.
if os.environ.get("NIDDOFLOW_ALLOW_DB_TESTS") != "1":
    print("No se ejecuta: este script modifica la base de datos real.")
    print("Para ejecutarlo de forma consciente:")
    print("    $env:NIDDOFLOW_ALLOW_DB_TESTS = '1'")
    sys.exit(2)

from app.repositories.categories_repository import CategoriesRepository  # noqa: E402
from app.services.categories_service import CategoriesService, CategoryServiceError  # noqa: E402

USER_A = "f5788158-ab53-40df-b86b-f9bc36e96c76"  # familia 0a3561f0-...
USER_B = "130ad64c-926c-454c-90a9-1a8dbf7d9e07"  # otra familia

ok = 0
fail = 0


def check(label, condition, detail=""):
    global ok, fail
    if condition:
        ok += 1
        print(f"  PASS  {label}")
    else:
        fail += 1
        print(f"  FAIL  {label}  {detail}")


async def main():
    service = CategoriesService(CategoriesRepository())
    repo = CategoriesRepository()

    # Familia del usuario de prueba: acota la limpieza para no tocar
    # categorias de otros usuarios ni las categorias por defecto.
    profile = repo.get_user_profile(USER_A)
    family_a = profile.data[0]["family_id"] if profile.data else None

    # Limpieza de restos de ejecuciones anteriores (solo de esta familia).
    for stale in ("Cafe de la Familia", "Cafe Familiar", "Prueba Icono Raro", "Cafe de la familia"):
        repo.db.table("categories").delete().eq("name", stale).eq("family_id", family_a).execute()
    # Solo las reglas creadas por este test (el comercio "tiendas ara"),
    # nunca todas las reglas aprendidas del usuario.
    repo.db.table("user_category_rules").delete().eq("user_id", USER_A).eq("merchant", "tiendas ara").execute()

    print("\n== 1. GET /categories/ (no se rompe) ==")
    cats = await service.get_categories(USER_A)
    check("devuelve categorias", len(cats) > 0, f"len={len(cats)}")
    check("incluye defaults", any(c.get("is_default") for c in cats))
    check(
        "cada una trae id/name/type/icon/is_default/family_id",
        all(
            all(k in c for k in ("id", "name", "type", "icon", "is_default", "family_id"))
            for c in cats
        ),
    )

    print("\n== 2. POST /categories/ (family_id del perfil) ==")
    created = await service.create_category(
        USER_A, {"name": "Cafe de la Familia", "type": "expense", "icon": "Coffee"}
    )
    cat_id = created["id"]
    check("crea la categoria", bool(cat_id))
    check("family_id viene del perfil", str(created["family_id"]) == "0a3561f0-9607-41e8-8d41-5c1b22cf0d16")
    check("is_default False", created["is_default"] is False)
    check("icon valido se guarda", created["icon"] == "Coffee")

    print("\n== 3. Icono invalido -> null, no error ==")
    bad_icon = await service.create_category(
        USER_A, {"name": "Prueba Icono Raro", "type": "expense", "icon": "NoExisteEsteIcono"}
    )
    check("icono desconocido -> None", bad_icon["icon"] is None, bad_icon["icon"])
    await service.delete_category(USER_A, bad_icon["id"])

    print("\n== 4. Duplicado -> 409 ==")
    try:
        await service.create_category(
            USER_A, {"name": "cafe de la familia", "type": "expense", "icon": "Coffee"}
        )
        check("duplicado (mismo nombre, distintas mayusculas) -> 409", False, "no lanzo")
    except CategoryServiceError as e:
        check("duplicado -> 409", e.status_code == 409, f"status={e.status_code}")
        check("el mensaje trae el id de la existente", str(cat_id) in str(e.extra))

    print("\n== 5. Mismo nombre pero distinto tipo -> permitido ==")
    other_type = await service.create_category(
        USER_A, {"name": "Cafe de la Familia", "type": "income"}
    )
    check("distinto tipo no es duplicado", other_type["type"] == "income")
    await service.delete_category(USER_A, other_type["id"])

    print("\n== 6. PATCH: renombrar y cambiar icono ==")
    updated = await service.update_category(
        USER_A, cat_id, {"name": "Cafe Familiar", "icon": "CupSoda"}
    )
    check("renombra", updated["name"] == "Cafe Familiar")
    check("cambia icono", updated["icon"] == "CupSoda")

    print("\n== 7. PATCH sobre categoria por defecto -> 403 ==")
    default_cat = next(c for c in cats if c.get("is_default"))
    try:
        await service.update_category(USER_A, default_cat["id"], {"name": "Hackeada"})
        check("default no editable -> 403", False, "no lanzo")
    except CategoryServiceError as e:
        check("default no editable -> 403", e.status_code == 403, f"status={e.status_code}")

    print("\n== 8. PATCH sobre categoria de otra familia -> 403 ==")
    try:
        await service.update_category(USER_B, cat_id, {"name": "Robada"})
        check("otra familia -> 403", False, "no lanzo")
    except CategoryServiceError as e:
        check("otra familia -> 403", e.status_code == 403, f"status={e.status_code}")

    print("\n== 9. DELETE sobre categoria de otra familia -> 403 ==")
    try:
        await service.delete_category(USER_B, cat_id)
        check("DELETE otra familia -> 403", False, "no lanzo")
    except CategoryServiceError as e:
        check("DELETE otra familia -> 403", e.status_code == 403, f"status={e.status_code}")

    print("\n== 10. DELETE de default -> 403 ==")
    try:
        await service.delete_category(USER_A, default_cat["id"])
        check("DELETE default -> 403", False, "no lanzo")
    except CategoryServiceError as e:
        check("DELETE default -> 403", e.status_code == 403, f"status={e.status_code}")

    print("\n== 11. DELETE propio -> warnings ==")
    result = await service.delete_category(USER_A, cat_id)
    check("deleted True", result["deleted"] is True)
    warnings = result["warnings"]
    check("warnings con las 3 cuentas", all(
        k in warnings for k in ("transactions_affected", "budgets_affected", "items_affected")
    ), str(warnings))
    check("warnings con mensaje", bool(warnings.get("message")))

    print("\n== 12. Categorias aprendidas (reglas) ==")
    rule = await service.create_category_rule(
        USER_A, "  TIENDAS  ARA  ", "  CAFE  ", "Comida"
    )
    check("merchant normalizado", rule["merchant"] == "tiendas ara", rule["merchant"])
    check("raw_keyword normalizado", rule["raw_keyword"] == "cafe", rule["raw_keyword"])
    check("category es el nombre canonico", rule["category"] == "Comida", rule["category"])
    check("user_id del token", str(rule["user_id"]) == USER_A)

    rule2 = await service.create_category_rule(USER_A, "TIENDAS ARA", "CAFE", "Transporte")
    check("upsert: misma clave actualiza", rule2["category"] == "Transporte", rule2["category"])
    rules = await service.get_category_rules(USER_A)
    check("lista las reglas del usuario", len(rules) >= 1)
    rules_filtered = await service.get_category_rules(USER_A, "tiendas ara")
    check("filtra por comercio", len(rules_filtered) == 1, str(len(rules_filtered)))

    print("\n== 13. Regla con categoria inexistente -> 400 ==")
    try:
        await service.create_category_rule(USER_A, "OTRO", "X", "Categoria Inventada")
        check("categoria inexistente -> 400", False, "no lanzo")
    except CategoryServiceError as e:
        check("categoria inexistente -> 400", e.status_code == 400, f"status={e.status_code}")

    print("\n== 14. Las reglas del usuario B no ven las de A ==")
    rules_b = await service.get_category_rules(USER_B)
    check("aislamiento por usuario", len(rules_b) == 0, str(rules_b))

    print("\n== 15. Limpieza de la regla de prueba ==")
    repo = CategoriesRepository()
    # Se borra solo la regla del test, no todas las del usuario.
    repo.db.table("user_category_rules").delete().eq("user_id", USER_A).eq("merchant", "tiendas ara").execute()
    check("reglas de prueba borradas", len(await service.get_category_rules(USER_A, "tiendas ara")) == 0)

    print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
    return 1 if fail else 0


sys.exit(asyncio.run(main()))
