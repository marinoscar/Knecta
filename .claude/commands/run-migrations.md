---
description: Run database migrations and generate Prisma client
allowed-tools: Bash, Read
model: haiku
---

# Run Migrations & Generate Prisma Client

Run migration and Prisma client generation steps. Report status after each step.

If running inside a **git worktree**, resolve all paths relative to the worktree root (not the main checkout).

---

## Step 0: Detect Docker Containers (do this FIRST)

Before anything else, check if Docker Compose dev stack is running:

```bash
docker compose -f infra/compose/base.compose.yml -f infra/compose/dev.compose.yml ps --format '{{.Name}}' 2>/dev/null
```

Save whether the API container exists (look for `compose-api-1` in the output).
You will need this for Step 2.

---

## Step 1: Load Environment & Construct DATABASE_URL

Read `infra/compose/.env` from the repo root. Extract these variables:
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_SSL`

**Construct `DATABASE_URL`** from these values using this format:
```
postgresql://<USER>:<PASSWORD_URL_ENCODED>@<HOST>:<PORT>/<DB>
```

If `POSTGRES_SSL=true`, append `?sslmode=require`.

**URL-encode the password** — special characters like `!`, `@`, `#`, `$` must be percent-encoded (e.g. `!` → `%21`). Common encodings:
- `!` → `%21`, `@` → `%40`, `#` → `%23`, `$` → `%24`, `%` → `%25`, `^` → `%5E`, `&` → `%26`

Example with password `P@ss!word`:
```
DATABASE_URL=postgresql://myuser:P%40ss%21word@dbhost.local:5432/mydb
```

Save this `DATABASE_URL` — you will pass it to Prisma commands in Steps 2 and 3.

**IMPORTANT — Database connectivity:**
- The `.env` `POSTGRES_HOST` (e.g. `pgadmin.local`) is only resolvable **inside the Docker API container** (via `extra_hosts: "pgadmin.local:host-gateway"` in `dev.compose.yml`).
- It is **NOT resolvable from the host machine** shell.
- **Therefore: all Prisma commands that connect to the database (migrate) MUST run inside the API container.**
- Prisma `generate` does NOT connect to the database — it runs on the host.

---

## Step 2: Check & Run Database Migrations

### MUST run inside Docker
The database host is only reachable from inside the Docker network. Running from the host shell will fail with `P1000: Authentication failed`.

**If Docker is NOT running** (from Step 0), skip this step and mark as SKIP.

**Check migration status** — pass `DATABASE_URL` directly to Prisma inside the container:
```bash
docker exec -e DATABASE_URL="<constructed_url>" compose-api-1 npx prisma migrate status --schema=/app/prisma/schema.prisma
```

**If there are pending migrations**, apply them:
```bash
docker exec -e DATABASE_URL="<constructed_url>" compose-api-1 npx prisma migrate deploy --schema=/app/prisma/schema.prisma
```

Key details:
- Pass `DATABASE_URL` via `docker exec -e` — this injects the env var directly, bypassing the need for `prisma-env.js`.
- Use `--schema=/app/prisma/schema.prisma` to point Prisma to the schema file inside the container.
- Do NOT use `sh -c` wrapping — passing args directly to `npx` avoids shell quoting issues.

Report: how many migrations applied (or "already current").

---

## Step 3: Generate Prisma Client

This runs on the **host machine** (not in Docker) so the generated client is available to the local `node_modules` for typecheck and tests.

From `apps/api/`, pass `DATABASE_URL` directly:
```bash
cd apps/api && DATABASE_URL="<constructed_url>" npx prisma generate
```

This is idempotent and fast. It does NOT connect to the database — it only reads `schema.prisma` and generates TypeScript types. `DATABASE_URL` is required because the schema references `env("DATABASE_URL")`, but Prisma only validates the variable exists, it doesn't connect.

---

## Step 4: Summary

Print a short status report:

```
=== Migration Summary ===
| Step                  | Status |
|-----------------------|--------|
| Migrations            | ...    |
| Prisma Client         | ...    |

Migrations applied: <count or "already current">
```

Use PASS, SKIP (Docker not running), or FAIL for status.
