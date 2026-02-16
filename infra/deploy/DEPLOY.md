# Knecta - VPS Deployment Runbook

This document describes how to deploy **Knecta** on an Ubuntu VPS using the `/opt/infra` infrastructure model.

It follows the same conventions as the rest of the infrastructure repository:

* Root-operated server
* Docker Compose per app
* Nginx reverse proxy (Docker)
* No secrets committed to Git
* Deterministic, repeatable steps

---

## 1. Prerequisites

Before deploying Knecta, the following must already be in place:

* Ubuntu VPS with `/opt/infra` initialized
* Docker + Docker Compose installed
* Shared Docker network `proxy` created (`docker network create proxy`)
* Nginx reverse proxy running from `/opt/infra/proxy`
* DNS A record: `knecta.marin.cr` pointing to VPS IP
* Google OAuth credentials configured for `knecta.marin.cr`
* S3 bucket (AWS, R2, or MinIO) for file storage
* At least one LLM API key (OpenAI or Anthropic)

---

## 2. Architecture

```
Internet
   |
   v
VPS Nginx Proxy (knecta.marin.cr:443)
   |  proxy Docker network
   v
knecta-nginx (:80)            <-- internal same-origin router
   |  app-network
   +---> knecta-web (:80)      <-- React static files (nginx:alpine)
   +---> knecta-api (:3000)    <-- NestJS API (node:20-alpine)
            |
            +---> knecta-db (:5432)      <-- PostgreSQL 15
            +---> knecta-neo4j (:7687)   <-- Neo4j 5
            +---> knecta-sandbox (:8000) <-- Python code runner
```

Key points:

* Single domain `knecta.marin.cr` handles both frontend and API
* The internal nginx routes `/` to the web container, `/api` to the API container
* The VPS proxy handles TLS termination and passes everything to the internal nginx
* No containers expose ports to the host; all traffic flows through Docker networks

---

## 3. Directory Layout

After deployment, the structure on the VPS:

```
/opt/infra/apps/knecta/
    .env                    # Runtime secrets (NOT committed)
    .env.example            # Template for reference
    compose.yml             # Docker Compose file
    nginx-prod.conf         # Internal nginx config (production)
    knecta.conf             # VPS proxy config (copy to proxy/nginx/conf.d/)
    install-knecta.sh       # Installer script
    repo/                   # Cloned application source code
    data/                   # Persistent data (NOT committed)
        postgres/           # PostgreSQL data files
        neo4j/              # Neo4j graph data
```

---

## 4. Initial Deployment

### Step 1: Create the app directory

```bash
mkdir -p /opt/infra/apps/knecta
cd /opt/infra/apps/knecta
```

### Step 2: Copy deployment files

Copy the contents of `infra/deploy/` from the Knecta repo to `/opt/infra/apps/knecta/`:

```bash
# Option A: Clone the repo first, then copy
git clone https://github.com/marinoscar/Knecta.git /tmp/knecta-deploy
cp /tmp/knecta-deploy/infra/deploy/* /opt/infra/apps/knecta/
rm -rf /tmp/knecta-deploy

# Option B: If you already have the files locally, scp them
# scp -r infra/deploy/* root@your-vps:/opt/infra/apps/knecta/
```

Make the install script executable:

```bash
chmod +x /opt/infra/apps/knecta/install-knecta.sh
```

### Step 3: Configure environment

```bash
cd /opt/infra/apps/knecta
cp .env.example .env
nano .env
```

**Required values to change** (marked `CHANGE_ME` in the template):

| Variable | How to generate / where to find |
|----------|-------------------------------|
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `NEO4J_PASSWORD` | `openssl rand -base64 24` (min 8 chars) |
| `JWT_SECRET` | `openssl rand -base64 32` |
| `COOKIE_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Same as above |
| `INITIAL_ADMIN_EMAIL` | Your email for first admin login |
| `S3_BUCKET` | Your S3 bucket name |
| `AWS_ACCESS_KEY_ID` | AWS IAM credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM credentials |
| `OPENAI_API_KEY` | [OpenAI Dashboard](https://platform.openai.com/api-keys) |

### Step 4: Run the install script

```bash
cd /opt/infra/apps/knecta
./install-knecta.sh
```

This will:
1. Clone the repository to `./repo/`
2. Build all Docker images (api, web, sandbox) and pull postgres + neo4j
3. Start all 6 containers
4. Run Prisma migrations (creates all database tables)
5. Run database seed (creates roles, permissions, system settings)
6. Verify service health

Expected build time: 3-5 minutes on first run.

### Step 5: Configure VPS reverse proxy

Copy the proxy config:

```bash
cp /opt/infra/apps/knecta/knecta.conf /opt/infra/proxy/nginx/conf.d/
```

### Step 6: Obtain TLS certificate

Using the webroot method (proxy stays running):

```bash
certbot certonly --webroot -w /opt/infra/proxy/webroot -d knecta.marin.cr
```

Or standalone method (temporarily stops proxy):

```bash
cd /opt/infra/proxy
docker compose stop
certbot certonly --standalone -d knecta.marin.cr
docker compose up -d
```

### Step 7: Reload VPS proxy

```bash
docker exec proxy-nginx nginx -t
docker exec proxy-nginx nginx -s reload
```

### Step 8: Configure Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), add the authorized redirect URI:

```
https://knecta.marin.cr/api/auth/google/callback
```

### Step 9: Verify

```bash
# Check all containers
docker compose -f /opt/infra/apps/knecta/compose.yml ps

# API health
curl https://knecta.marin.cr/api/health/live

# Web frontend
curl -sI https://knecta.marin.cr/ | head -5
```

Open `https://knecta.marin.cr` in a browser and log in via Google OAuth.

---

## 5. Updating Knecta

To deploy the latest code:

```bash
cd /opt/infra/apps/knecta
./install-knecta.sh
```

The script detects the existing repository and runs `git pull` instead of `git clone`. It rebuilds images, runs any new migrations, and restarts all services.

---

## 6. Backup

### PostgreSQL

```bash
docker compose -f /opt/infra/apps/knecta/compose.yml exec -T db \
  pg_dump -U knecta knecta | gzip > /opt/infra/backups/knecta-pg-$(date +%Y%m%d).sql.gz
```

### Neo4j

Neo4j Community Edition does not support online backup. Stop the container first:

```bash
cd /opt/infra/apps/knecta
docker compose stop neo4j
cp -r data/neo4j /opt/infra/backups/knecta-neo4j-$(date +%Y%m%d)
docker compose start neo4j
```

### Restore PostgreSQL

```bash
gunzip -c /opt/infra/backups/knecta-pg-YYYYMMDD.sql.gz | \
  docker compose -f /opt/infra/apps/knecta/compose.yml exec -T db \
  psql -U knecta knecta
```

---

## 7. Operational Commands

### View logs

```bash
cd /opt/infra/apps/knecta

# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db
docker compose logs -f neo4j
```

### Restart services

```bash
cd /opt/infra/apps/knecta
docker compose restart           # All services
docker compose restart api       # Just the API
```

### Full rebuild (after code changes)

```bash
cd /opt/infra/apps/knecta
docker compose build --no-cache
docker compose up -d
```

### Run Prisma migrations manually

```bash
docker compose -f /opt/infra/apps/knecta/compose.yml exec api npm run prisma:migrate
```

---

## 8. Troubleshooting

### API won't start

```bash
docker compose logs api
```

Common causes:
* Database not ready yet (check `docker compose logs db`)
* Missing environment variable (check `.env` for `CHANGE_ME` values)
* Prisma migrations not run (run `docker compose exec api npm run prisma:migrate`)

### Neo4j authentication failure

Neo4j requires passwords of at least 8 characters. Check `NEO4J_PASSWORD` in `.env`.

### SSE streaming not working (agent timeouts)

Verify that both nginx configs have SSE support:
* Internal: `nginx-prod.conf` has dedicated SSE location blocks with `proxy_buffering off`
* VPS proxy: `knecta.conf` has `proxy_buffering off` and 300s timeouts

### OAuth redirect mismatch

Ensure `GOOGLE_CALLBACK_URL` in `.env` matches exactly what is registered in Google Cloud Console:
```
https://knecta.marin.cr/api/auth/google/callback
```

### Container name conflicts

If containers from a previous install exist:

```bash
cd /opt/infra/apps/knecta
docker compose down
docker compose up -d --build
```

### Port conflicts

No ports are published to the host. If you see port conflicts, another service may be using the `proxy` network with the same container name. Check with:

```bash
docker network inspect proxy
```

---

## 9. Design Notes

* Source code lives in `repo/` and is fully replaceable via `git pull`
* Configuration is centralized in `.env` (single source of truth)
* Docker images are rebuilt explicitly (no auto-pull)
* The VPS proxy owns TLS termination; the internal nginx handles same-origin routing
* PostgreSQL and Neo4j data persist in `data/` bind mounts (easy to back up)
* Knecta runs its own isolated PostgreSQL (not the shared VPS database)

---

## 10. Certificate Renewal

Certbot auto-renewal should already be configured on the VPS. Verify:

```bash
certbot renew --dry-run
```

If Knecta's certificate was added after the initial certbot setup, it will be included automatically in the next renewal cycle.
