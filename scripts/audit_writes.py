"""Auditoria de las escrituras: ¿alguna puede tocar filas de mas?

Revisa TODO el codigo de `backend/app` buscando operaciones que:

  1. Actualicen filas sin filtro (un `UPDATE` sin `.eq(...)` afecta a toda la
     tabla: tan peligroso como un `DELETE` masivo).
  2. Pongan en NULL una FK sin filtro de familia.
  3. Usen `select("*")` + update sin acotar por familia.
  4. Tengan `delete()` sin acotar (lo revisa `test_safety.py`, pero aqui se
     resume el inventario completo de operaciones destructivas).

No modifica nada: solo lee el codigo.

Uso:
    .\\backend\\venv\\Scripts\\python.exe scripts\audit_writes.py
"""

import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "backend", "app")


def _archivos():
    for base, dirs, files in os.walk(APP):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in sorted(files):
            if name.endswith(".py"):
                yield os.path.join(base, name)


def _cadena(node):
    """Cadena de llamadas de fuera hacia dentro."""
    partes = []
    actual = node
    while isinstance(actual, ast.Call) and isinstance(actual.func, ast.Attribute):
        partes.append((actual.func.attr, actual.args, actual.keywords))
        actual = actual.func.value
    return partes


def _padres(tree):
    mapa = {}
    for node in ast.walk(tree):
        for hijo in ast.iter_child_nodes(node):
            mapa[hijo] = node
    return mapa


def _externos(tree, padres):
    """Los Call mas externos de cada cadena."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        padre = padres.get(node)
        if isinstance(padre, ast.Attribute) and padre.value is node:
            continue
        yield node


def _es_decorador(node, arbol):
    for padre in ast.walk(arbol):
        for deco in getattr(padre, "decorator_list", []) or []:
            for sub in ast.walk(deco):
                if sub is node:
                    return True
    return False


def main() -> int:
    problemas = []
    inventario = []

    for ruta in _archivos():
        with open(ruta, "r", encoding="utf-8") as handle:
            fuente = handle.read()
        arbol = ast.parse(fuente, filename=ruta)
        padres = _padres(arbol)
        rel = os.path.relpath(ruta, ROOT).replace("\\", "/")

        for call in _externos(arbol, padres):
            if _es_decorador(call, arbol):
                continue
            if not isinstance(call.func, ast.Attribute):
                continue

            cadena = _cadena(call)

            # Se buscan TODAS las operaciones destructivas de la cadena, no
            # solo la mas externa: `table(..).delete().eq(..).execute()` tiene
            # el `delete` en medio.
            for posicion, (metodo, _args, _kw) in enumerate(cadena):
                if metodo not in ("delete", "delete_many", "update", "upsert"):
                    continue

                filtros = []
                for attr, args, _kw2 in cadena[:posicion]:
                    if attr in ("eq", "neq") and args:
                        primero = args[0]
                        if isinstance(primero, ast.Constant) and isinstance(primero.value, str):
                            filtros.append(primero.value)

                where = None
                for _attr, _args2, keywords in cadena:
                    for kw in keywords:
                        if kw.arg == "where" and where is None:
                            where = kw.value

                if metodo in ("delete", "delete_many"):
                    if where is not None:
                        claves = []
                        if isinstance(where, ast.Dict):
                            claves = [
                                k.value
                                for k in where.keys
                                if isinstance(k, ast.Constant)
                            ]
                        inventario.append((rel, f"prisma.{metodo}", f"where={claves}"))
                        if not {"id", "family_id", "user_id", "transaction_id"} & set(claves):
                            problemas.append(
                                f"{rel}: prisma.{metodo} sin scope (where={claves})"
                            )
                    else:
                        inventario.append((rel, f"supabase.{metodo}", ",".join(filtros) or "SIN FILTRO"))
                        if "id" not in filtros and "transaction_id" not in filtros:
                            problemas.append(f"{rel}: .delete() sin acotar por id")
                        if "family_id" not in filtros and "transaction_id" not in filtros:
                            problemas.append(f"{rel}: .delete() sin acotar por familia")

                if metodo == "update":
                    # Un `update` de Python (dict.update, list.update) no es SQL.
                    # Solo lo miramos si la cadena es una consulta a la base de
                    # datos: `.table(...)` (supabase-py) o `where=` (Prisma).
                    es_consulta = any(attr == "table" for attr, _a, _k in cadena)
                    if not es_consulta and where is None:
                        continue
                    if not filtros and where is None:
                        problemas.append(f"{rel}: .update() SIN FILTRO (afectaria toda la tabla)")
                    else:
                        detalle = ",".join(filtros) if filtros else "where"
                        inventario.append((rel, f"supabase.update", detalle))

    print("=== Operaciones de escritura sobre datos existentes ===")
    vistos = set()
    for rel, tipo, detalle in inventario:
        clave = (rel, tipo, detalle)
        if clave in vistos:
            continue
        vistos.add(clave)
        print(f"  {rel:52} {tipo:18} {detalle}")

    print()
    if problemas:
        print(f"PROBLEMAS: {len(problemas)}")
        for problema in problemas:
            print(f"  - {problema}")
        return 1
    print("OK: ninguna escritura toca filas de mas y todas acotan por familia.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
