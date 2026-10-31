"""Verificación integral de NiddoFlow.

Ejecuta todas las comprobaciones de la entrega en un solo comando y devuelve
código de salida 1 si algo falla. Pensado para correrse justo antes de
entregar, no durante el desarrollo.

Uso:
    python scripts/verify_all.py
    python scripts/verify_all.py --skip-frontend   # si no hay node disponible
"""

import argparse
import os
import shutil
import subprocess
import sys
from typing import List, Tuple

# La salida de Next.js y de pytest puede traer caracteres que la consola de
# Windows (cp1252) no sabe codificar. Sin esto, imprimir el detalle de un
# fallo revienta con UnicodeEncodeError y se pierde el reporte.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

# Raíz del repositorio: se deduce de la ubicación de este archivo para que el
# script funcione en cualquier máquina, no solo en la del desarrollador.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
VENV_PY = os.path.join(BACKEND, "venv", "Scripts", "python.exe")

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


class Result:
    def __init__(self):
        self.passed: List[str] = []
        self.failed: List[Tuple[str, str]] = []
        self.skipped: List[Tuple[str, str]] = []

    def ok(self, name: str):
        self.passed.append(name)
        print(f"  {GREEN}OK{RESET}    {name}")

    def fail(self, name: str, detail: str):
        self.failed.append((name, detail))
        print(f"  {RED}FALLA{RESET} {name}")
        for line in detail.strip().splitlines()[-12:]:
            print(f"        {line}")

    def skip(self, name: str, why: str):
        self.skipped.append((name, why))
        print(f"  {YELLOW}OMITE{RESET} {name}: {why}")

    def summary(self) -> int:
        print("\n" + "=" * 68)
        print(f"  {len(self.passed)} correctos · {len(self.failed)} fallos · {len(self.skipped)} omitidos")
        if self.failed:
            print("\n  Fallos:")
            for name, detail in self.failed:
                print(f"   - {name}")
        print("=" * 68)
        return 1 if self.failed else 0


def run(cmd: List[str], cwd: str, timeout: int = 600) -> Tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True,
            timeout=timeout, encoding="utf-8", errors="replace",
        )
        return proc.returncode, (proc.stdout or "") + (proc.stderr or "")
    except FileNotFoundError:
        return 127, f"no encontrado: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return 124, "tiempo de espera agotado"


def check_backend_imports(res: Result):
    name = "Backend: la app importa y registra todos los routers"
    code, out = run([VENV_PY, "-c",
                     "from main import app; "
                     "paths=sorted({r.path for r in app.routes}); "
                     "print('PATHS:' + ','.join(paths))"], BACKEND)
    if code != 0:
        res.fail(name, out)
        return

    expected = [
        "/categories/", "/transactions/", "/budgets/", "/insights/",
        "/import/preview", "/import/commit", "/recurring-bills/",
        "/api/ocr/extract", "/api/chat/message",
    ]
    missing = [p for p in expected if p not in out]
    if missing:
        res.fail(name, f"faltan rutas: {missing}\n{out[-800:]}")
    else:
        res.ok(name)


def check_pytest(res: Result):
    name = "Backend: suite de pruebas (pytest)"
    code, out = run([VENV_PY, "-m", "pytest", "-q"], BACKEND, timeout=900)
    if code != 0:
        res.fail(name, out)
    else:
        resumen = [l for l in out.strip().splitlines() if "passed" in l or "failed" in l]
        res.ok(name + (f" — {resumen[-1].strip()}" if resumen else ""))


def check_iso_week(res: Result):
    name = "Semana ISO: backend y frontend coinciden con isocalendar (2018-2030)"
    code, out = run([VENV_PY, os.path.join("tests", "verify_iso_week.py")], BACKEND)
    if code != 0:
        res.fail(name, out)
    else:
        res.ok(name)


def check_sql_safety(res: Result):
    name = "SQL: sin DDL destructivo y con RLS completa"
    code, out = run([VENV_PY, os.path.join("..", "scripts", "verify_migrations.py")], BACKEND)
    if code != 0:
        res.fail(name, out)
    else:
        res.ok(name)


def _npx() -> List[str]:
    """Resuelve `npx` en Windows (`.cmd`) y en Unix."""
    exe = shutil.which("npx") or shutil.which("npx.cmd")
    if not exe:
        return ["npx"]
    return [exe]


def check_frontend_types(res: Result):
    name = "Frontend: TypeScript sin errores (tsc --noEmit)"
    if not os.path.exists(os.path.join(FRONTEND, "node_modules")):
        res.skip(name, "node_modules ausente")
        return
    code, out = run(_npx() + ["tsc", "--noEmit"], FRONTEND, timeout=900)
    if code != 0:
        res.fail(name, out)
    else:
        res.ok(name)


def check_frontend_build(res: Result):
    name = "Frontend: build de producción"
    if not os.path.exists(os.path.join(FRONTEND, "node_modules")):
        res.skip(name, "node_modules ausente")
        return
    code, out = run(_npx() + ["next", "build"], FRONTEND, timeout=1800)
    if code != 0:
        res.fail(name, out)
    else:
        res.ok(name)


def check_no_temp_files(res: Result):
    name = "Repo: sin archivos temporales de los agentes"
    leftovers = []
    for base, _dirs, files in os.walk(ROOT):
        if any(p in base for p in ("node_modules", ".git", ".next", "venv", "__pycache__")):
            continue
        for f in files:
            if f.startswith("_tmp") or f.startswith("_probe"):
                leftovers.append(os.path.relpath(os.path.join(base, f), ROOT))
    if leftovers:
        res.fail(name, "archivos sobrantes:\n  " + "\n  ".join(leftovers))
    else:
        res.ok(name)


def check_contract_files(res: Result):
    name = "Contrato: archivos clave presentes"
    required = [
        "backend/app/models/insights.py",
        "backend/app/services/insights_service.py",
        "backend/app/routers/insights.py",
        "backend/app/services/budget_period.py",
        "backend/app/services/ai_tools.py",
        "backend/app/services/import_parsers.py",
        "backend/app/services/bank_import_service.py",
        "backend/app/routers/bank_import.py",
        "backend/app/routers/recurring_bills.py",
        "backend/app/routers/shopping.py",
        "backend/app/routers/goals.py",
        "backend/app/routers/category.py",
        "supabase/migrations/20261030_improvements.sql",
        "supabase/migrations/20261030_debts_category_set_null.sql",
        "scripts/verify_migrations.py",
        "scripts/verify_db_state.py",
        "scripts/verify_schema_in_docker.py",
        "frontend/src/components/ui/molecules/OcrItemsEditor.tsx",
        "frontend/src/app/import/ImportClient.tsx",
        "frontend/src/app/shopping/ShoppingClient.tsx",
        "frontend/src/app/goals/GoalsClient.tsx",
        "frontend/src/app/bills/BillsClient.tsx",
    ]
    missing = [p for p in required if not os.path.exists(os.path.join(ROOT, p))]
    if missing:
        res.fail(name, "faltan:\n  " + "\n  ".join(missing))
    else:
        res.ok(name)


def check_schema_en_docker(res):
    """Valida el SQL en un Postgres desechable (idempotencia real).

    Requiere Docker. Si no esta disponible, se omite (no es un fallo).
    """
    name = "Schema: el SQL es idempotente en Postgres real"
    script = os.path.join(ROOT, "scripts", "verify_schema_in_docker.py")
    proc = subprocess.run(
        [sys.executable, script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=ROOT,
    )
    if proc.returncode == 2:
        res.skip(name, "Docker no esta disponible")
        return
    if proc.returncode != 0:
        res.fail(name, (proc.stdout or "")[-1200:])
        return
    res.ok(name)


def check_auditoria_escrituras(res):
    """Ninguna escritura (update/delete) puede tocar filas de mas."""
    name = "Escrituras: ninguna actualiza o borra filas sin acotar"
    script = os.path.join(ROOT, "scripts", "audit_writes.py")
    proc = subprocess.run(
        [sys.executable, script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=ROOT,
    )
    if proc.returncode != 0:
        res.fail(name, (proc.stdout or "")[-1500:])
        return
    res.ok(name)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    res = Result()

    print("\nVerificación integral de NiddoFlow")
    print("-" * 68)

    print("\n[1/6] Backend")
    check_backend_imports(res)
    check_pytest(res)
    check_iso_week(res)

    print("\n[2/6] Datos")
    check_sql_safety(res)
    check_schema_en_docker(res)
    check_auditoria_escrituras(res)

    print("\n[3/6] Contrato")
    check_contract_files(res)

    print("\n[4/6] Higiene")
    check_no_temp_files(res)

    if not args.skip_frontend:
        print("\n[5/6] Frontend")
        check_frontend_types(res)
        if not args.skip_build:
            check_frontend_build(res)
    else:
        print("\n[5/6] Frontend")
        res.skip("Frontend", "omitido por bandera")

    print("\n[6/6] Fin")

    return res.summary()


if __name__ == "__main__":
    sys.exit(main())
