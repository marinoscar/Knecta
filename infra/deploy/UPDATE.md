# Knecta - Update Guide

This document covers how to update a running Knecta installation on the VPS.

For **first-time installation**, see [DEPLOY.md](DEPLOY.md).

---

## Quick Reference

```bash
# Standard update (most common)
cd /opt/infra/apps/knecta
./update.sh

# Force rebuild (if Docker cache is stale)
./update.sh --no-cache

# Skip proxy config update
./update.sh --skip-proxy
```

---

## What the Update Script Does

The `update.sh` script performs 6 steps:

| Step | Action | Details |
|------|--------|---------|
| 1 | **Pull latest code** | `git fetch` + `git reset --hard origin/main`. Exits early if already up to date. |
| 2 | **Rebuild images** | `docker compose build`. Only layers that changed are rebuilt (fast). |
| 3 | **Run migrations** | `docker compose run --rm api npm run prisma:migrate`. Runs in a temporary container before restarting the API. |
| 4 | **Restart services** | `docker compose up -d`. Only recreates containers whose images changed. Dependencies (Neo4j, sandbox) stay running if unchanged. |
| 5 | **Update proxy config** | Compares `knecta.conf` with the deployed copy. If changed, copies it and reloads nginx. Tests config before reloading. |
| 6 | **Verify health** | Checks API (`/health/ready`), web container, and container count. |

### Key design decisions

- **Migrations run before restart**: A temporary container runs `prisma:migrate` so the database schema is updated before the new API starts. This prevents the API from crashing on startup due to missing tables/columns.
- **Early exit if no changes**: If `origin/main` matches the local commit, the script exits immediately. No unnecessary rebuilds.
- **Proxy config diffing**: The script only copies and reloads nginx if `knecta.conf` actually changed, avoiding unnecessary proxy restarts.
- **Rollback info**: The script displays the previous commit hash and rollback commands if something goes wrong.

---

## Command-Line Options

| Flag | Description |
|------|-------------|
| `--no-cache` | Passes `--no-cache` to `docker compose build`, forcing a full rebuild from scratch. Use this if you suspect stale Docker layers. Takes longer (3-5 min vs ~30s). |
| `--skip-proxy` | Skips the proxy configuration update step entirely. Useful if you manage the proxy config separately or are testing API-only changes. |
| `--help`, `-h` | Shows usage information. |

---

## Update Workflow

### Standard update (pushed code to GitHub)

```bash
# 1. SSH into VPS
ssh root@your-vps

# 2. Run update
cd /opt/infra/apps/knecta
./update.sh

# 3. Verify
curl https://knecta.marin.cr/api/health/ready
```

### After a database schema change (new Prisma migration)

No extra steps needed. The update script automatically runs `prisma:migrate` which applies any pending migrations. The migration runs in a temporary container before the API restarts, so the schema is ready when the new API comes up.

### After changing environment variables

Environment variables live in `.env` and are **not** in the git repository. Edit them manually:

```bash
cd /opt/infra/apps/knecta
nano .env

# Then restart to pick up the new values
docker compose up -d
```

The update script does not modify `.env`. If a new release adds required variables, check `infra/deploy/.env.example` in the updated code for new entries.

### After changing the nginx proxy config

If the update includes changes to `knecta.conf`, the script automatically:

1. Detects the diff between the repo copy and the deployed copy
2. Copies the new config to `/opt/infra/proxy/nginx/conf.d/`
3. Tests the nginx config (`nginx -t`)
4. Reloads nginx if the test passes

If the config test fails, the script warns you and does **not** reload. Fix the issue and reload manually:

```bash
docker exec proxy-nginx nginx -t
docker exec proxy-nginx nginx -s reload
```

---

## Rollback

If an update breaks something, roll back to the previous version:

```bash
cd /opt/infra/apps/knecta

# 1. Reset code to previous commit (shown in update output)
git -C repo reset --hard <previous-commit-hash>

# 2. Rebuild and restart
docker compose build
docker compose up -d

# 3. Verify
curl https://knecta.marin.cr/api/health/ready
```

**Important**: Rollback does **not** undo database migrations. If the failed update included a migration, you may need to manually revert it:

```bash
# Check current migration status
docker compose run --rm -T api npx prisma migrate status

# If needed, manually revert in psql
# (Prisma does not support automatic rollback)
```

---

## Troubleshooting

### "Already up to date" but I pushed changes

The script compares `HEAD` with `origin/main`. Check:

```bash
# Verify the branch
cd /opt/infra/apps/knecta/repo
git remote -v          # Should point to your repo
git branch             # Should be on main
git fetch origin
git log --oneline origin/main -5   # Check latest commits on remote
```

### API health check fails after update

```bash
# Check API logs for startup errors
docker compose logs --tail 50 api

# Common causes:
# - New env var required (check .env.example for additions)
# - Migration failed (check step 3 output)
# - Dependency not available (Neo4j, sandbox, PostgreSQL)
```

### Migration fails

```bash
# Check migration status
docker compose run --rm -T api npx prisma migrate status

# If a migration is stuck, check the database directly
# and resolve manually, then re-run:
docker compose run --rm -T api npm run prisma:migrate
```

### Docker build fails

```bash
# Try a clean rebuild
docker compose build --no-cache

# If disk space is an issue
docker system prune -f
docker compose build
```

### Proxy config test fails after update

```bash
# Check what changed
diff /opt/infra/apps/knecta/knecta.conf /opt/infra/proxy/nginx/conf.d/knecta.conf

# Test manually
docker exec proxy-nginx nginx -t

# If the new config is broken, restore the old one
# (the update script does not overwrite on test failure)
```

---

## Monitoring After Update

After a successful update, monitor for a few minutes:

```bash
# Watch API logs for errors
docker compose -f /opt/infra/apps/knecta/compose.yml logs -f api

# Check resource usage
docker stats --no-stream

# Test key endpoints
curl -s https://knecta.marin.cr/api/health/ready | jq .
curl -sI https://knecta.marin.cr/ | head -5
```

---

## Differences from install-knecta.sh

| Concern | install-knecta.sh | update.sh |
|---------|-------------------|-----------|
| Directory creation | Yes | No |
| Git clone | Yes (first time) | No (fetch + reset only) |
| .env validation | Yes | Assumes exists |
| Database seed | Yes | No (seed is idempotent but unnecessary) |
| TLS certificate | Post-install instructions | Not handled |
| Proxy setup | Post-install instructions | Auto-detects changes |
| Early exit if current | No | Yes |
| Rollback instructions | No | Yes (shows commit hashes) |
