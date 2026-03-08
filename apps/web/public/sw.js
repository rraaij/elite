const SHELL_CACHE = "elite-shell-v1";
const DATA_CACHE = "elite-data-v1";
const SHELL_ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(SHELL_CACHE)
			.then((cache) => cache.addAll(SHELL_ASSETS))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

async function cacheFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	if (cached) {
		return cached;
	}
	const response = await fetch(request);
	if (response.ok) {
		cache.put(request, response.clone());
	}
	return response;
}

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const networkPromise = fetch(request)
		.then((response) => {
			if (response.ok) {
				cache.put(request, response.clone());
			}
			return response;
		})
		.catch(() => null);

	if (cached) {
		return cached;
	}
	const network = await networkPromise;
	if (network) {
		return network;
	}
	return new Response("Offline and uncached", { status: 503, statusText: "Service Unavailable" });
}

async function networkFirstNavigation(request) {
	const cache = await caches.open(SHELL_CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) {
			cache.put("/index.html", response.clone());
		}
		return response;
	} catch {
		const cached = await cache.match("/index.html");
		if (cached) {
			return cached;
		}
		return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
	}
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) {
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(networkFirstNavigation(request));
		return;
	}

	if (url.pathname.startsWith("/game-data/")) {
		event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
		return;
	}

	if (url.pathname.startsWith("/assets/")) {
		event.respondWith(cacheFirst(request, SHELL_CACHE));
		return;
	}
});
