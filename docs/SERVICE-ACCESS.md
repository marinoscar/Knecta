# Service Access Guide

This document is the single reference for accessing all service UIs in this project — both in local development and production deployments.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Starting the Services](#starting-the-services)
3. [Application (Main UI)](#application-main-ui)
4. [Swagger UI (API Documentation)](#swagger-ui-api-documentation)
5. [PgAdmin (PostgreSQL Browser)](#pgadmin-postgresql-browser)
6. [Neo4j Browser (Graph Database)](#neo4j-browser-graph-database)
7. [Uptrace (Observability)](#uptrace-observability)
8. [Production Access](#production-access)
9. [Port Reference](#port-reference)

---

## Quick Reference

| Service | Dev URL | Credentials | Availability |
|---------|---------|-------------|--------------|
| Application | http://localhost:8319 | OAuth login | Always |
| Swagger UI | http://localhost:8319/api/docs | JWT Bearer token | Always |
| PgAdmin | http://localhost:5050 | No login (desktop mode) | Dev only |
| Neo4j Browser | http://localhost:7474 | `neo4j` / `changeme123` | Dev only |
| Uptrace | http://localhost:14318 | `admin@localhost` / `admin` | Dev + OTEL only |

---

## Starting the Services

All commands are run from the `infra/compose` directory.

**Development (core services only):**
```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml up
```
Starts: Application, API, PostgreSQL, Neo4j, PgAdmin, Nginx, Python Sandbox.

**Development with observability:**
```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml -f otel.compose.yml up
```
Starts everything above plus: OTEL Collector, Uptrace, ClickHouse.

**Production:**
```bash
cd infra/compose && docker compose -f base.compose.yml -f prod.compose.yml up
```
Starts core services only with resource limits and restart policies. No development UIs exposed.

---

## Application (Main UI)

| Environment | URL |
|-------------|-----|
| Development | http://localhost:8319 |
| Production | https://myserver.com |

The application is served through the Nginx reverse proxy. The UI is at `/` and the API is at `/api`.

**Authentication:** OAuth login is required. Google OAuth is the required provider. Microsoft Azure AD is optional — configure it with the `MICROSOFT_*` environment variables to enable it.

The first user to log in with the email matching `INITIAL_ADMIN_EMAIL` (from `.env`) is automatically granted the Admin role. All subsequent users receive the Contributor role by default.

---

## Swagger UI (API Documentation)

| Environment | URL |
|-------------|-----|
| Development | http://localhost:8319/api/docs |
| OpenAPI JSON | http://localhost:8319/api/openapi.json |
| Production | https://myserver.com/api/docs |

Swagger requires a valid JWT Bearer token to call authenticated endpoints. Access tokens expire after 15 minutes (configurable via `JWT_ACCESS_TTL_MINUTES`).

### Authenticating in Swagger

**Method 1: Device Authorization Flow (recommended)**

Use this flow to get a token without needing an active browser session. It is designed for non-browser clients such as Swagger, CLI tools, and scripts.

1. Call `POST /api/auth/device/code` in Swagger (this endpoint is public — no token needed). Note the `userCode` and `verificationUri` from the response.
2. Open the `verificationUri` in your browser and log in with OAuth. Enter the `userCode` to approve the device.
3. Poll `POST /api/auth/device/token` in Swagger with the `deviceCode` from step 1 until you receive an `accessToken`.
4. Click the **Authorize** button in Swagger (the padlock icon at the top of the page). Enter `Bearer <accessToken>` in the value field and click **Authorize**.

**Method 2: Copy from browser session (quick)**

If you are already logged into the web application:

1. Open the web application in your browser.
2. Open DevTools (F12) and go to the **Network** tab.
3. Find any API request to `/api/...` and inspect its request headers.
4. Copy the value of the `Authorization` header (it starts with `Bearer `).
5. Click **Authorize** in Swagger and paste the full value.

Note: This method only gives you the remaining lifetime of the current token (up to 15 minutes). Use the Device Authorization Flow for longer working sessions.

---

## PgAdmin (PostgreSQL Browser)

| Environment | URL |
|-------------|-----|
| Development | http://localhost:5050 |

PgAdmin runs as a Docker service in the dev compose stack (`dev.compose.yml`). It is configured in desktop mode — no browser login is required, it opens directly to the dashboard.

**Pre-configured server:** The "Knecta App DB (dev)" server appears automatically in the server tree (configured via `infra/pgadmin/servers.json`).

**First connection:** PgAdmin will prompt for the PostgreSQL password once. Enter `postgres` (the default from `.env`). The password is cached in the `pgadmin-data` Docker volume for subsequent sessions.

**Navigating the database:** Servers → Knecta App DB (dev) → Databases → appdb

**Environment variables** (in `infra/compose/.env`):
- `PGADMIN_DEFAULT_EMAIL` — default: `admin@local.dev`
- `PGADMIN_DEFAULT_PASSWORD` — default: `admin`

PgAdmin is **dev only** — it is not included in the production compose stack.

---

## Neo4j Browser (Graph Database)

| Environment | URL |
|-------------|-----|
| Development | http://localhost:7474 |

Neo4j Browser is the built-in web UI for querying and visualising the graph database. The ports `7474` (HTTP) and `7687` (Bolt) are only exposed to the host in development via `dev.compose.yml`.

**Credentials:**
- Username: `neo4j`
- Password: `changeme123` (default from `NEO4J_PASSWORD` in `.env`)

**Connect URL:** `neo4j://localhost:7687` or `bolt://localhost:7687`

Neo4j stores the ontology graphs generated from semantic models. You can inspect Dataset nodes, Field nodes, and `HAS_FIELD` / `RELATES_TO` relationships here. All nodes carry an `ontologyId` property for namespace isolation between ontologies.

**Example Cypher queries:**
```cypher
-- List all ontology namespaces
MATCH (d:Dataset) RETURN DISTINCT d.ontologyId, count(d) AS datasets

-- Inspect a specific ontology
MATCH (d:Dataset {ontologyId: '<your-ontology-id>'})
OPTIONAL MATCH (d)-[:HAS_FIELD]->(f:Field)
RETURN d, f

-- Show all relationships between datasets
MATCH (a:Dataset)-[r:RELATES_TO]->(b:Dataset)
RETURN a.name, type(r), b.name
```

Environment variables: `NEO4J_USER` and `NEO4J_PASSWORD` in `infra/compose/.env`.

---

## Uptrace (Observability)

| Environment | URL |
|-------------|-----|
| Dev + OTEL only | http://localhost:14318 |

Uptrace is the observability platform that displays distributed traces, metrics, and logs from the API. It is only available when the OTEL stack is running.

**Credentials:**
- Email: `admin@localhost`
- Password: `admin`

**Starting with OTEL:**
```bash
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml -f otel.compose.yml up
```

**How it works:**

The API sends telemetry to the OTEL Collector via HTTP on port `4318` (internal Docker network). The collector forwards this data to Uptrace. The Uptrace UI is exposed on host port `14318`.

```
API → otel-collector:4318 → Uptrace:14317 → ClickHouse (traces/metrics)
                                           → uptrace-pg (metadata)
```

**Uptrace DSN** (for direct SDK connections): `http://project1_secret_token@localhost:14317/1`

Set `OTEL_ENABLED=true` in `.env` to enable telemetry from the API. When using the OTEL compose profile, `otel.compose.yml` sets this automatically.

---

## Production Access

In production (`prod.compose.yml`), only the **Application** and **Swagger UI** are publicly accessible. All other service ports are intentionally not exposed to the host.

| Service | Production URL |
|---------|---------------|
| Application | https://myserver.com |
| Swagger UI | https://myserver.com/api/docs |
| PgAdmin | Not in production stack |
| Neo4j Browser | Not exposed — use SSH tunnel |
| Uptrace | Not exposed — use SSH tunnel |

### Accessing Admin UIs in Production via SSH Tunnel

Use SSH port forwarding to securely access Neo4j Browser, Uptrace, and PostgreSQL from your local machine without exposing these ports publicly.

**PostgreSQL (for local PgAdmin or psql):**
```bash
ssh -L 5432:localhost:5432 user@myserver.com
# Then connect PgAdmin or psql to localhost:5432
```

**Neo4j Browser:**
```bash
ssh -L 7474:localhost:7474 -L 7687:localhost:7687 user@myserver.com
# Then open http://localhost:7474
```

**Uptrace (requires OTEL stack running on server):**
```bash
ssh -L 14318:localhost:14318 user@myserver.com
# Then open http://localhost:14318
```

Alternatively, if your infrastructure uses a VPN or private network, you can access these services directly on their internal addresses without SSH tunnels.

---

## Port Reference

| Port | Service | Exposed In | Protocol |
|------|---------|------------|----------|
| 8319 | Nginx (Application + API) | All modes | HTTP |
| 5432 | PostgreSQL | Dev only | TCP |
| 5050 | PgAdmin | Dev only | HTTP |
| 7474 | Neo4j Browser | Dev only | HTTP |
| 7687 | Neo4j Bolt | Dev only | TCP |
| 14317 | Uptrace OTLP gRPC | Dev + OTEL | gRPC |
| 14318 | Uptrace UI | Dev + OTEL | HTTP |
| 4327 | OTEL Collector gRPC | Dev + OTEL | gRPC |
| 4328 | OTEL Collector HTTP | Dev + OTEL | HTTP |
