# Sahayak Backend

Backend for the Sahayak project. Built incrementally, stage by stage.

## Stage 2A - Authentication database foundation

Stage 2A adds the `users` table only. It does not add authentication, password
hashing, login, registration, tokens, or authorization middleware.

There is no migration runner yet. Execute the migration from the project root
with PostgreSQL's `psql` command:

```powershell
psql "$env:DATABASE_URL" -f src/database/migrations/005_create_users_table.sql
```

To verify that the table exists and inspect its columns:

```powershell
psql "$env:DATABASE_URL" -c "\d users"
```

The migration uses PostgreSQL's `pgcrypto` extension for UUID generation. Phone
numbers are prepared for future encryption as `phone_number_encrypted` (`BYTEA`)
and `phone_number_blind_index` (a unique HMAC-SHA256 hex value); no plaintext
phone-number column is created.

## Stage 1 - Scope

This stage sets up only the project skeleton:

- Express server (`app.js` for config, `server.js` to start it)
- Environment variable loading + validation
- PostgreSQL and Redis client setup (non-blocking: server still starts if either is down)
- `GET /api/v1/health` endpoint
- Centralized error handling + 404 handler
- Postman environment file

No authentication, encryption, DTMF, or database tables are implemented yet - those come in later stages.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create your `.env` file from the template:
   ```
   cp .env.example .env
   ```
   Then edit `.env` with your local PostgreSQL/Redis connection details.

3. Start the server in development mode (auto-restarts on file changes):
   ```
   npm run dev
   ```

   Or start it normally:
   ```
   npm start
   ```

The server will start on the port set in `.env` (default `5000`), even if PostgreSQL or Redis aren't running locally.

## Testing the health endpoint

Import `postman/Sahayak.postman_environment.json` into Postman, then send:

```
GET {{baseUrl}}/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "application": "ok",
    "server": "ok",
    "database": "ok",
    "redis": "ok",
    "timestamp": "2026-09-18T10:00:00.000Z"
  }
}
```

If PostgreSQL or Redis are not running, `database`/`redis` will show `"unavailable"` or `"disconnected"` instead - the request will still return HTTP 200.

## Project structure

See `src/` for the modular layout: `config/` (env, DB, Redis, constants), `database/` (connection helpers), `middleware/` (error handling), `routes/`, `utils/`.
