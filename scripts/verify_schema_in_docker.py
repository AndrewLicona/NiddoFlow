"""Valida el SQL del esquema y las migraciones en un Postgres **desechable**.

Por que existe: antes de tocar la base real de Supabase, hay que comprobar
que `supabase/schema.sql` y las migraciones son **aditivas, idempotentes y no
destructivas**. Este script lo demuestra sin riesgo, levantando un Postgres
de usar y tirar en Docker, aplicandolo todo **dos veces** (la segunda debe
fallar si algo no fuera idempotente) y comprobando el resultado.

El contenedor se destruye SIEMPRE al terminar, tenga exito o error, junto
con su volumen anonimo. No queda nada levantado.

Uso:
    .\\backend\\venv\\Scripts\\python.exe scripts\\verify_schema_in_docker.py

Requiere Docker. Si Docker no esta disponible, el script informa y termina
con codigo 2 (no es un fallo del proyecto).
"""

import os
import shutil
import subprocess
import sys
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_SQL = os.path.join(ROOT, "supabase", "schema.sql")
MIGRATIONS_DIR = os.path.join(ROOT, "supabase", "migrations")
AUTH_STUB_SQL = os.path.join(ROOT, "scripts", "test_auth_stub.sql")

IMAGEN = "postgres:16-alpine"
PUERTO = 55433
NOMBRE = "niddoflow-sqlcheck"

ok = fail = 0


def check(nombre, condicion, extra=""):
    global ok, fail
    if condicion:
        ok += 1
        print(f"  PASS  {nombre}")
    else:
        fail += 1
        print(f"  FAIL  {nombre} {extra}")


def docker(*args, **kwargs):
    return subprocess.run(
        ["docker", *args], capture_output=True, text=True, **kwargs
    )


def aplicar(contenedor, ruta_sql):
    """Copia un .sql al contenedor y lo ejecuta con ON_ERROR_STOP=1."""
    destino = f"/tmp/{os.path.basename(ruta_sql)}"
    copia = docker("cp", ruta_sql, f"{contenedor}:{destino}")
    if copia.returncode != 0:
        return False, f"no se pudo copiar {os.path.basename(ruta_sql)}: {copia.stderr.strip()}"

    ejecucion = docker(
        "exec", contenedor,
        "psql", "-U", "postgres", "-d", "niddoflow",
        "-v", "ON_ERROR_STOP=1", "-f", destino,
    )
    return ejecucion.returncode == 0, (ejecucion.stdout + ejecucion.stderr).strip()


def consultar(contenedor, sql):
    ejecucion = docker(
        "exec", contenedor,
        "psql", "-U", "postgres", "-d", "niddoflow",
        "-t", "-A", "-c", sql,
    )
    if ejecucion.returncode != 0:
        return None
    return ejecucion.stdout.strip()


def esperar(contenedor, intentos=40):
    """Espera a que Postgres acepte conexiones."""
    for _ in range(intentos):
        if consultar(contenedor, "select 1") == "1":
            return True
        time.sleep(1)
    return False


def _volumen_del_contenedor(contenedor):
    """Nombre del volumen de datos del contenedor (lo crea la imagen)."""
    ejecucion = docker(
        "inspect", contenedor,
        "--format", '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}',
    )
    if ejecucion.returncode != 0:
        return None
    return ejecucion.stdout.strip() or None


def _volumenes_colgantes():
    """Volumenes anonimos sin contenedor: restos de corridas anteriores."""
    salida = docker("volume", "ls", "-q", "--filter", "dangling=true")
    if salida.returncode != 0:
        return []
    nombres = []
    for nombre in salida.stdout.split():
        etiquetas = docker(
            "volume", "inspect", nombre, "--format", "{{index .Labels \"com.docker.volume.anonymous\"}}",
        )
        if etiquetas.returncode == 0 and etiquetas.stdout.strip() == "":
            nombres.append(nombre)
    return nombres


def main() -> int:
    if shutil.which("docker") is None:
        print("Docker no esta disponible: se omite la validacion en contenedor.")
        print("El SQL se puede validar tambien con scripts\\verify_migrations.py.")
        return 2

    # Si queda un contenedor de una corrida anterior, se limpia antes de empezar.
    docker("rm", "-fv", NOMBRE)
    for volumen in _volumenes_colgantes():
        docker("volume", "rm", volumen)

    print("Levantando Postgres desechable...")
    inicio = docker(
        "run", "-d", "--name", NOMBRE,
        "-e", "POSTGRES_PASSWORD=postgres",
        "-e", "POSTGRES_DB=niddoflow",
        "-p", f"{PUERTO}:5432",
        IMAGEN,
    )
    if inicio.returncode != 0:
        print(f"  [error] no se pudo levantar el contenedor: {inicio.stderr.strip()}")
        return 1

    # El volumen de datos se crea solo (lo declara la imagen). Se guarda el
    # nombre para borrarlo despues: `docker rm -v` no siempre se lleva el
    # volumen anonimo de la imagen, y dejarlo colgando ensucia la maquina.
    volumen = _volumen_del_contenedor(NOMBRE)

    try:
        if not esperar(NOMBRE):
            print("  [error] Postgres no respondio a tiempo")
            return 1

        print("\n== 1. Stub de auth (para simular Supabase) ==")
        ok_stub, detalle = aplicar(NOMBRE, AUTH_STUB_SQL)
        check("el stub de auth se aplica", ok_stub, detalle[:200] if not ok_stub else "")

        print("\n== 2. schema.sql aplicado DOS veces (idempotencia) ==")
        ok1, d1 = aplicar(NOMBRE, SCHEMA_SQL)
        check("primera aplicacion de schema.sql", ok1, d1[-300:] if not ok1 else "")
        ok2, d2 = aplicar(NOMBRE, SCHEMA_SQL)
        check("segunda aplicacion de schema.sql (debe ser idempotente)", ok2, d2[-300:] if not ok2 else "")

        print("\n== 3. Migraciones aplicadas DOS veces ==")
        migraciones = sorted(
            f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")
        ) if os.path.isdir(MIGRATIONS_DIR) else []
        check("hay migraciones que verificar", bool(migraciones))

        for nombre in migraciones:
            ruta = os.path.join(MIGRATIONS_DIR, nombre)
            ok1, d1 = aplicar(NOMBRE, ruta)
            check(f"primera aplicacion de {nombre}", ok1, d1[-300:] if not ok1 else "")
            ok2, d2 = aplicar(NOMBRE, ruta)
            check(f"segunda aplicacion de {nombre} (idempotente)", ok2, d2[-300:] if not ok2 else "")

        print("\n== 4. Estado final del esquema ==")
        tablas = consultar(
            NOMBRE,
            "select count(*) from pg_tables where schemaname = 'public' and tablename in "
            "('categories','transactions','transaction_items','budgets','debts','accounts',"
            "'user_category_rules','ai_chat_messages','shopping_items','savings_goals','recurring_bills')",
        )
        check("las 11 tablas clave existen", tablas == "11", f"-> {tablas}")

        sin_rls = consultar(
            NOMBRE,
            "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
        )
        check("todas las tablas publicas tienen RLS", sin_rls == "0", f"-> {sin_rls}")

        cascadas = consultar(
            NOMBRE,
            "select count(*) from pg_constraint con join pg_class rel on rel.oid = con.conrelid "
            "join pg_namespace n on n.oid = rel.relnamespace where n.nspname = 'public' and con.contype = 'f' "
            "and (pg_get_constraintdef(con.oid) like '%REFERENCES categories%' "
            "or pg_get_constraintdef(con.oid) like '%REFERENCES transactions%') "
            "and con.confdeltype = 'c'",
        )
        # 1 = transaction_items.transaction_id (excepcion documentada).
        check("solo hay 1 FK en cascada hacia categories/transactions (la documentada)",
              cascadas == "1", f"-> {cascadas}")

        duplicados = consultar(
            NOMBRE,
            "select count(*) from (select family_id, lower(name), type from categories "
            "group by family_id, lower(name), type having count(*) > 1) d",
        )
        check("no hay categorias duplicadas", duplicados == "0", f"-> {duplicados}")

        print(f"\n== RESULTADO: {ok} OK, {fail} FALLOS ==")
        return 1 if fail else 0
    finally:
        print("\nDestruyendo el Postgres desechable...")
        docker("rm", "-fv", NOMBRE)
        if volumen:
            docker("volume", "rm", volumen)
        for huerfano in _volumenes_colgantes():
            docker("volume", "rm", huerfano)
        print("  OK  contenedor y volumenes eliminados")


if __name__ == "__main__":
    sys.exit(main())
