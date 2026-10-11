// Variables serveur minimales requises par lib/server/*.ts pendant les tests de route handlers.
// Valeurs sentinelles, sans rapport avec un environnement réel.
process.env.BACKEND_API_BASE_URL ??= 'http://backend.test';
process.env.BACKEND_API_KEY ??= 'test-backend-api-key';
process.env.CSRF_SECRET ??= 'test-csrf-secret';
process.env.SESSION_COOKIE_NAME ??= 'session_token';
process.env.SESSION_COOKIE_SECURE ??= 'false';
