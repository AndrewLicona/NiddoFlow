# Post LinkedIn — Del ritual manual a Dockploy

Nuestro despliegue funcionaba. Ese era el problema.

Cada update al servidor era una secuencia de pasos que alguien tenía que ejecutar bien, en el orden correcto, en el directorio correcto. Y el que lo ejecutaba no era un sistema: éramos nosotros.

---

🕹️ Cómo lo hacíamos

El ritual, proyecto por proyecto, era siempre el mismo:

1. SSH al VPS
2. Entrar al directorio del repo
3. `git pull`
4. `docker compose down`
5. `docker compose build` (5-15 min)
6. `docker compose up -d`
7. `docker logs -f` para confirmar
8. `docker ps` para ver que todo estaba healthy

Hasta el paso 7 todo bien. El paso 5 era donde se caía.

---

🔴 El problema

Si el build fallaba a mitad, el stack quedaba abajo y la app caía. No había plan B: SSH, leer logs, adivinar, reintentar a mano. Cada fallo era tiempo de inactividad y decisiones improvisadas.

Y alrededor de eso, tres cosas que no se veían en el `git push`:

• El conocimiento del deploy vivía en la cabeza de las personas y en un script por app. N fuentes de verdad.
• Los `.env` se editaban en crudo, sobre el servidor. Cada credencial tocada a mano es un riesgo.
• No había forma de ver de un vistazo qué estaba arriba, en qué versión y con qué configuración.

Funcionaba. Pero "funciona" y "escala" son cosas distintas.

---

🐳 La solución: Dockploy

Dejar de repetir el ritual y dejar que el sistema lo ejecutara.

Cada repo quedó conectado a su pipeline: un `git push` dispara build y deploy. Y todo el estado de los servicios vive en un panel web, con logs, variables de entorno y versiones.

El cambio real no fue la herramienta: fue que el deploy pasó de ser **una tarea que alguien tenía que hacer bien** a ser **un evento que el sistema hace por ti**.

---

🌤️ Ahora

• Push y olvidas. Cero SSH para actualizar código.
• Un panel con todos los servicios, logs y variables de entorno.
• Rollback = desplegar un commit anterior.
• Actualizar dos apps = dos pushes.

Lo que antes era una lista de comandos que había que recordar, ahora es un commit.

---

💡 Una lección

Automatizar primero lo que la gente hace todos los días es lo que de verdad mueve la aguja. El resto se va resolviendo solo.

¿Cómo manejan los deploys ustedes? 👇

#DevOps #Docker #Dockploy #SelfHosting
