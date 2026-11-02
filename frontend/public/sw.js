/*
 * NiddoFlow Service Worker
 *
 * Bump de CACHE_NAME para invalidar la cache anterior. Al desplegar una
 * version nueva hay que cambiar este valor; `activate` borra las caches
 * viejas automaticamente.
 */
const CACHE_NAME = 'niddoflow-v2';

/*
 * NO se precachea '/'. El HTML de la app depende del estado de sesion
 * (usuario logueado o no), asi que servirlo desde cache deja al usuario
 * viendo una version desactualizada o deslogueada de la aplicacion.
 * Las navegaciones usan network-first y solo caen a la cache si la red
 * falla.
 */
const PRECACHE_ASSETS = [
    '/manifest.json',
    '/icon.png',
];

/* Rutas que nunca deben cachearse: datos dinamicos y flujos de auth. */
const NEVER_CACHE_PREFIXES = ['/api/', '/auth/', '/_next/webpack-hmr'];

function isNeverCache(url) {
    return NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/* Assets estaticos e inmutables (hash en el nombre) -> cache primero. */
function isStaticAsset(url) {
    return (
        url.pathname.startsWith('/_next/static/') ||
        url.pathname === '/icon.png' ||
        /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/.test(url.pathname)
    );
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            // addAll() falla entero si un solo recurso falla; se anade
            // uno por uno para que un 404 no impida instalar el SW.
            await Promise.all(
                PRECACHE_ASSETS.map(async (asset) => {
                    try {
                        await cache.add(asset);
                    } catch (err) {
                        console.warn('[sw] no se pudo precachear', asset, err);
                    }
                })
            );
            await self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME && key.startsWith('niddoflow-'))
                    .map((key) => caches.delete(key))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Solo interceptamos requests del mismo origen.
    if (url.origin !== self.location.origin) return;

    if (isNeverCache(url)) return;

    // Navegaciones: network-first. La app es dinamica (sesion, datos),
    // asi que la red manda; la cache es solo el fallback offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const response = await fetch(request);
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, response.clone());
                    return response;
                } catch (err) {
                    const cached = await caches.match(request);
                    if (cached) return cached;
                    const fallback = await caches.match('/');
                    if (fallback) return fallback;
                    return new Response(
                        '<!doctype html><meta charset="utf-8"><title>Sin conexion</title>' +
                            '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
                            '<h1>Sin conexion</h1>' +
                            '<p>No pudimos conectarnos a NiddoFlow. Revisa tu conexion e intenta de nuevo.</p>',
                        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                }
            })()
        );
        return;
    }

    // Assets estaticos: cache-first + revalidacion en segundo plano.
    if (isStaticAsset(url)) {
        event.respondWith(
            (async () => {
                const cached = await caches.match(request);
                const network = fetch(request)
                    .then((response) => {
                        if (response && response.ok) {
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
                        }
                        return response;
                    })
                    .catch(() => undefined);

                return cached || (await network) || new Response('', { status: 504 });
            })()
        );
        return;
    }

    // Resto de GETs: network-first con fallback a cache.
    event.respondWith(
        (async () => {
            try {
                const response = await fetch(request);
                if (response && response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, response.clone());
                }
                return response;
            } catch (err) {
                const cached = await caches.match(request);
                if (cached) return cached;
                return new Response('', { status: 504 });
            }
        })()
    );
});
