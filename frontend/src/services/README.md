/**
 * Frontend architecture
 *
 * UI (React pages/components)
 *   → services/*Api.ts  (Axios calls, no business rules)
 *   → FastAPI routers   (HTTP + Pydantic validation + role checks)
 *   → services/         (business logic)
 *   → repositories/     (SQLAlchemy)
 *   → SQLite
 *
 * Rules: never trust the UI; never store secrets/tokens in localStorage;
 * passwords only as hashed values on the server.
 */
export {};
