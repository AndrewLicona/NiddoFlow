import subprocess
import os
import sys
import time
import signal

def run_services():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    backend_dir = os.path.join(root_dir, "backend")

    # Detect OS for terminal execution
    is_windows = os.name == 'nt'
    
    # Prefer the documented environment, while retaining support for older setups.
    venv_dir = os.path.join(backend_dir, '.venv')
    if not os.path.isdir(venv_dir):
        venv_dir = os.path.join(backend_dir, 'venv')
    if is_windows:
        python = os.path.join(venv_dir, 'Scripts', 'python.exe')
    else:
        python = os.path.join(venv_dir, 'bin', 'python')
    if not os.path.isfile(python):
        raise SystemExit('No se encontró el entorno Python. Consulta README.md para crearlo.')
    backend_cmd = [python, '-m', 'uvicorn', 'main:app', '--reload', '--host', '0.0.0.0', '--port', '8000']

    # Frontend command: npm run dev
    frontend_cmd = ['npm.cmd' if is_windows else 'npm', 'run', 'dev']

    print("🚀 Iniciando NiddoFlow...")
    
    processes = []
    try:
        # Start Backend
        print("📂 Iniciando Backend (FastAPI)...")
        backend_proc = subprocess.Popen(backend_cmd, cwd=backend_dir)
        processes.append(backend_proc)

        # Start Frontend
        print("📂 Iniciando Frontend (Next.js)...")
        frontend_env = os.environ.copy()
        frontend_env.setdefault('NEXT_PUBLIC_API_URL', 'http://localhost:8000')
        frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir, env=frontend_env)
        processes.append(frontend_proc)

        print("\n✅ Ambos servicios están corriendo.")
        print("🌐 Frontend: http://localhost:3000")
        print("⚙️  Backend:  http://localhost:8000")
        print("\nPresiona Ctrl+C para detener ambos servicios.\n")

        # Keep the script running while processes are active
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n🛑 Deteniendo NiddoFlow...")
        for p in processes:
            if is_windows:
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)])
            else:
                p.terminate()
        print("👋 ¡Hasta luego!")

if __name__ == "__main__":
    run_services()
