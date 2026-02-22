---
description: Validate the codebase — run migrations, generate Prisma client, typecheck, tests, restart services, and report status
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, Task
model: sonnet
---

# Validate Codebase

Run all validation steps in order. After each step, report status before moving on.
Track progress with a TodoWrite checklist. Fix any issues you find and commit fixes per project commit rules.

If running inside a **git worktree**, resolve all paths relative to the worktree root (not the main checkout).

---

## Step 0: Detect Docker Containers (do this FIRST)

Before anything else, check if Docker Compose dev stack is running:

```bash
docker compose -f infra/compose/base.compose.yml -f infra/compose/dev.compose.yml ps --format '{{.Name}}' 2>/dev/null
```

Save whether the API container exists (look for `compose-api-1` in the output).
You will need this for Steps 2, 3, 6, and 7.

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

Save this `DATABASE_URL` — you will pass it to all Prisma commands in Steps 2 and 3.

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

## Step 4: TypeScript Typecheck

Run typecheck in **both** projects (can run in parallel since they are independent). Fix any errors before moving on.

```bash
cd apps/api && npm run typecheck
cd apps/web && npm run typecheck
```

If either fails:
1. Read the error output carefully
2. Fix the type errors in the source files
3. Re-run typecheck to confirm the fix
4. Commit the fix: `fix(api): resolve type errors` or `fix(web): resolve type errors`

Common type error patterns:
- `TS2352` mock cast errors in test files: add `as unknown as <Type>` intermediate cast
- Missing properties after Prisma schema changes: regenerate Prisma client (Step 3)

Repeat until both pass clean.

---

## Step 5: Run All Tests

Run tests in **both** projects (can run in parallel as background tasks). Fix any failures before moving on.

**Backend** (Jest — MUST use npm script, not direct jest):
```bash
cd apps/api && npm test
```

**Frontend** (Vitest — use single-run mode, not watch):
```bash
cd apps/web && npm run test:run
```

If any tests fail:
1. Read the failure output
2. Determine if it's a code bug or a test that needs updating
3. Fix the issue
4. Re-run the failing test suite to confirm
5. Commit: `fix(api): fix failing tests` or `fix(web): fix failing tests`

Repeat until all tests pass.

---

## Step 6: Restart API & Verify

**If Docker is NOT running** (from Step 0), skip this step and mark SKIP.

Restart the API container:
```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml restart api
```

Wait 10 seconds, then check for errors:
```bash
sleep 10 && cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml logs --tail 80 api
```

Look for:
- `Nest application successfully started` — good
- `Server listening at http://...` — good
- `Database connected` — good
- Any ERROR or stack trace — investigate and fix

Verify health:
```bash
curl -s http://localhost:8319/api/health/ready
```

Expected: JSON with `"status":"ok"`, database `"status":"up"`, neo4j `"status":"up"`.

If errors appear in the logs:
1. Analyze the error
2. Fix the root cause in the source code
3. Wait for hot-reload to pick up the change (dev mode auto-reloads via volume mounts)
4. Re-check logs and health
5. Commit the fix

---

## Step 7: Restart Web & Verify

**If Docker is NOT running** (from Step 0), skip this step and mark SKIP.

Restart the web container:
```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml restart web
```

Wait 5 seconds, then check:
```bash
sleep 5 && cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml logs --tail 50 web
```

Look for: `VITE vX.X.X ready in XXX ms` — good.

Verify HTTP response:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8319/
```

Expected: `200`.

If errors appear, fix, wait for reload, re-check, and commit.

---

## Step 8: Summary Report

Print a final status report in this format:

```
=== Validation Summary ===
| Step                  | Status |
|-----------------------|--------|
| Migrations            | ...    |
| Prisma Client         | ...    |
| Typecheck (API)       | ...    |
| Typecheck (Web)       | ...    |
| Tests (API)           | ...    |
| Tests (Web)           | ...    |
| API Service           | ...    |
| Web Service           | ...    |

Commits made: <list any commits created during fixes, or "None">
Issues remaining: <list any unresolved problems, or "None">
```

Use PASS, FIXED (was broken, now fixed), SKIP (not applicable), or FAIL (could not resolve) for status.
