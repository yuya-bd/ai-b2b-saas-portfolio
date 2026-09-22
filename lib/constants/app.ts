/**
 * Single source of truth for the application slug.
 *
 * It prefixes the session cookie and namespaces cache keys, so two apps
 * sharing a hostname or a Redis instance do not collide. Changing it
 * invalidates every existing session.
 */
export const APP_SLUG = process.env.APP_SLUG || "saas-foundation";

/** Human-readable name, used in email subjects and layouts. */
export const APP_NAME = process.env.APP_NAME || "SaaS Foundation";

/** Name of the Better Auth session cookie, e.g. `saas-foundation.session_token`. */
export const SESSION_COOKIE_NAME = `${APP_SLUG}.session_token`;
