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
    
    # Backend command: Use venv uvicorn directly
    if is_windows:
        backend_cmd = f"cd {backend_dir} && venv\\Scripts\\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000"
    else:
        backend_cmd = f"cd {backend_dir} && ./venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000"

    # Frontend command: npm run dev
    frontend_cmd = f"cd {frontend_dir} && npm run dev"

    print("🚀 Iniciando NiddoFlow...")
    
    processes = []
    try:
        # Start Backend
        print("📂 Iniciando Backend (FastAPI)...")
        backend_proc = subprocess.Popen(backend_cmd, shell=True)
        processes.append(backend_proc)

        # Start Frontend
        print("📂 Iniciando Frontend (Next.js)...")
        frontend_proc = subprocess.Popen(frontend_cmd, shell=True)
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
