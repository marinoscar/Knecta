---
description: Validate the codebase — run migrations, generate Prisma client, typecheck, tests, restart services, and report status
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, Task
---

# Validate Codebase

Run all validation steps in order. After each step, report status before moving on.
Track progress with a TodoWrite checklist. Fix any issues you find and commit fixes per project commit rules.

If running inside a **git worktree**, resolve all paths relative to the worktree root (not the main checkout).

---

## Step 1: Load Environment

Read `infra/compose/.env` from the repo root. Extract the `POSTGRES_*` variables — you will need them for Prisma commands in subsequent steps.

Construct the env var export string for bash:
```
export POSTGRES_HOST=<value> POSTGRES_PORT=<value> POSTGRES_USER=<value> POSTGRES_PASSWORD=<value> POSTGRES_DB=<value> POSTGRES_SSL=<value>
```

---

## Step 2: Check & Run Database Migrations

From `apps/api/`, with the env vars from Step 1 exported, run:

```bash
node scripts/prisma-env.js migrate status
```

- If there are **pending migrations**, run: `npm run prisma:migrate` (this runs `prisma migrate deploy`)
- If already up to date, note it and move on
- Report: how many migrations applied (or "already current")

---

## Step 3: Generate Prisma Client

From `apps/api/`, with the env vars from Step 1 exported, run:

```bash
npm run prisma:generate
```

This is idempotent and fast if already current. Always run it to ensure the client matches the schema.

---

## Step 4: TypeScript Typecheck

Run typecheck in **both** projects. Fix any errors before moving on.

```bash
cd apps/api && npm run typecheck
cd apps/web && npm run typecheck
```

If either fails:
1. Read the error output carefully
2. Fix the type errors in the source files
3. Re-run typecheck to confirm the fix
4. Commit the fix: `fix(api): resolve type errors` or `fix(web): resolve type errors`

Repeat until both pass clean.

---

## Step 5: Run All Tests

Run tests in **both** projects. Fix any failures before moving on.

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

Detect which Docker Compose config is running:

```bash
docker compose -f infra/compose/base.compose.yml -f infra/compose/dev.compose.yml ps --format '{{.Name}}' 2>/dev/null
```

If containers are running, restart the API:

```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml restart api
```

Wait 10 seconds, then check for errors:

```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml logs --tail 80 api
```

Verify health:
```bash
curl -s http://localhost:8319/api/health/ready
```

If errors appear in the logs:
1. Analyze the error
2. Fix the root cause in the source code
3. Wait for hot-reload to pick up the change (dev mode auto-reloads)
4. Re-check logs and health
5. Commit the fix

If no Docker containers are running, skip this step and note it in the summary.

---

## Step 7: Restart Web & Verify

Using the same Docker Compose files:

```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml restart web
```

Wait 5 seconds, then check:

```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml logs --tail 50 web
```

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8319/
```

If errors appear, fix, wait for reload, re-check, and commit.

If no Docker containers are running, skip and note it.

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
