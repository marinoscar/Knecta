# CLAUDE.md

This file provides guidance for AI assistants working on this codebase.

## Project Overview

Web Application Foundation with React UI + Node API + PostgreSQL. Production-grade foundation with OAuth authentication, RBAC authorization, and flexible settings framework.

## Technology Stack

- **Backend**: Node.js + TypeScript, NestJS with Fastify adapter
- **Frontend**: React + TypeScript, Material UI (MUI)
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Passport strategies (Google OAuth required)
- **Testing**: Jest + Supertest (backend), React Testing Library + Jest (frontend)
- **Observability**: OpenTelemetry, Uptrace, Pino structured logging
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx (same-origin routing)

## Repository Structure

```
/
  apps/
    api/                    # Backend API
      src/
      test/
      prisma/
        schema.prisma
        migrations/
      Dockerfile            # API container (near its code)
    web/                    # Frontend React app
      src/
      src/__tests__/
      Dockerfile            # Web container (near its code)
  docs/                     # Documentation
  infra/                    # Infrastructure configuration
    compose/
      base.compose.yml       # Core services: api, web, db, nginx
      dev.compose.yml        # Development overrides (hot reload, volumes)
      prod.compose.yml       # Production overrides (resource limits)
      otel.compose.yml       # Observability: uptrace, clickhouse, otel-collector
      .env.example           # Environment variables template
    nginx/
      nginx.conf             # Nginx routing configuration
    otel/
      otel-collector-config.yaml   # OTEL Collector config
      uptrace.yml            # Uptrace configuration
  tests/e2e/                # Optional E2E tests
```

## MANDATORY: Worktree-Based Feature Development

Every feature or fix MUST be developed in a Git worktree. The main checkout stays on `main` at all times.

### Worktree Location & Naming
- All worktrees live under `worktrees/` in the repo root (git-ignored, never committed)
- Use **flat short names**: `worktrees/<short-name>` (e.g., `worktrees/add-export`, `worktrees/fix-auth-bug`)
- The branch name follows conventional format: `feat/<short-name>`, `fix/<short-name>`, etc.

### Workflow (Claude MUST follow)

**Starting feature work:**
1. From the main checkout, create the worktree:
   ```bash
   git worktree add worktrees/<short-name> -b <type>/<short-name>
   ```
   Example: `git worktree add worktrees/add-export -b feat/add-export`
2. All development happens inside `worktrees/<short-name>/`
3. Commits follow all existing commit rules (see below)

**Finishing feature work:**
1. Ensure all changes are committed inside the worktree
2. Remove the worktree:
   ```bash
   git worktree remove worktrees/<short-name>
   ```
3. The branch remains for PR/merge

### Rules
- NEVER checkout feature branches in the main working directory
- NEVER work on features directly in the main checkout
- One worktree per feature branch (Git enforces this)
- If the worktree already exists for the requested feature, work inside it (don't recreate)

## MANDATORY: Claude Commit-Only Git Rules

Claude: these rules are **MANDATORY**. Follow them exactly.  
Your job is **only** to create clean, frequent commits while implementing the requested work.  
Assume the branch already exists and is checked out. Do **not** create branches or PRs.

---

### Core Commit Rules (MANDATORY)
1. **Commit early, commit often.** Do not leave large uncommitted change sets.
2. Each commit must be **small, coherent, and reviewable**.
3. **One intent per commit** (no “misc fixes” bundles).
4. **Do not include unrelated refactors** unless explicitly requested.
5. If you change behavior, you must add/adjust tests in the same commit or the next immediate commit.

---

### Commit Message Standard (MANDATORY: Conventional Commits)
Use this format:

`<type>(<scope>): <short imperative summary>`

Allowed types:
- `feat:` new functionality
- `fix:` bug fix
- `refactor:` internal change, no behavior change
- `test:` add/adjust tests only
- `docs:` documentation only
- `chore:` tooling, deps, formatting, build, CI

Scopes (pick one relevant area):
- `api`, `web`, `db`, `infra`, `auth`, `chat`, `ui`, `core`, `jobs`, `docs`, `tests`

Examples:
- `feat(chat): add permit search prompt builder`
- `fix(api): handle missing location gracefully`
- `test(api): cover permit filter edge cases`
- `chore(web): run formatter`

---

### Commit Cadence (MANDATORY)
Make commits at these checkpoints:

1) **Scaffold / wiring**
- New files, routes, handlers, basic plumbing (even if incomplete).
- Example: `feat(api): scaffold permit lookup endpoint`

2) **Core functionality**
- Implement the smallest working slice end-to-end.
- Example: `feat(core): implement permit filtering by location radius`

3) **Edge cases + validation**
- Input validation, error handling, fallback behavior.
- Example: `fix(api): validate lat/lng inputs and return 400`

4) **Tests**
- Unit/integration tests for the new behavior and critical edge cases.
- Example: `test(api): add coverage for location filter and empty results`

5) **Cleanup**
- Remove dead code, rename for clarity, small refactors strictly related to the change.
- Example: `refactor(core): extract permit query builder`

6) **Docs (if needed)**
- Only if the task requires it.
- Example: `docs(api): document permit endpoint parameters`

---

### What to Include / Exclude (MANDATORY)
#### Include
- Code + tests for the same feature area
- Minimal config changes needed to run/build/test
- Small, related refactors that reduce complexity for the feature

#### Exclude
- Repo-wide formatting changes unless required
- Dependency upgrades unless required
- Unrelated cleanup in neighboring modules

---

### Commit Command Sequence (MANDATORY)
Before committing:
1. `git status`
2. `git diff`
3. Stage intentionally:
   - `git add -p` (preferred) or `git add <files>`

Commit:
- `git commit -m "<type>(<scope>): <summary>"`

After commit:
- `git status`

Repeat until the next checkpoint is complete, then commit again.

---

### Handling Mixed Changes (MANDATORY)
If you accidentally made unrelated edits:
- Revert them before committing, or
- Split into separate commits (preferred). Only keep the unrelated commit if explicitly requested.

---

### If Tests Cannot Be Run (MANDATORY)
If you cannot run tests for a valid reason (missing env, tool not available):
- Still commit, but include a clear note in the commit body.

Example:
- Subject: `feat(api): implement permit search by address`
- Body: `Notes: tests not run (DB env not available).`

---

### Golden Rule (MANDATORY)
If the diff feels “big,” you waited too long. **Split the work and commit sooner.**

## Architecture Principles

1. **Separation of Concerns**: UI handles presentation only; API handles all business logic and authorization
2. **Same-Origin Hosting**: UI at `/`, API at `/api`, Swagger at `/api/docs`
3. **Security by Default**: All API endpoints require authentication unless explicitly public
4. **API-First**: All business logic resides in the API layer

## Key Commands

```bash
# Setup: copy environment template
cp infra/compose/.env.example infra/compose/.env

# Start development (from infra/compose folder)
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml up

# Start development with observability (Uptrace UI at http://localhost:14318)
cd infra/compose && docker compose -f base.compose.yml -f dev.compose.yml -f otel.compose.yml up

# Start production mode
cd infra/compose && docker compose -f base.compose.yml -f prod.compose.yml up

# Run API tests
cd apps/api && npm test

# Run frontend tests
cd apps/web && npm test

# Generate Prisma client after schema changes
cd apps/api && npm run prisma:generate

# Create a new migration (development)
cd apps/api && npm run prisma:migrate:dev -- --name <migration_name>

# Apply migrations (production)
cd apps/api && npm run prisma:migrate

# Note: Use npm scripts (prisma:*) instead of direct npx commands
# They automatically construct DATABASE_URL from individual env vars
```

## Service URLs (Development)

- **Application**: http://localhost:8319 (via Nginx)
- **Swagger UI**: http://localhost:8319/api/docs
- **Neo4j Browser**: http://localhost:7474 (direct, dev only)
- **Uptrace**: http://localhost:14318 (when otel stack running)

## API Endpoints (MVP)

### Authentication
- `GET /api/auth/providers` - List enabled OAuth providers
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout and invalidate session
- `POST /api/auth/logout-all` - Logout from all devices
- `GET /api/auth/me` - Get current user

### Device Authorization (RFC 8628)
- `POST /api/auth/device/code` - Generate device code (Public)
- `POST /api/auth/device/token` - Poll for authorization (Public)
- `GET /api/auth/device/activate` - Get activation info
- `POST /api/auth/device/authorize` - Approve/deny device
- `GET /api/auth/device/sessions` - List device sessions
- `DELETE /api/auth/device/sessions/{id}` - Revoke device session

### Users (Admin-only)
- `GET /api/users` - List users (paginated)
- `GET /api/users/{id}` - Get user by ID
- `PATCH /api/users/{id}` - Update user (roles, activation)
- `PUT /api/users/{id}/roles` - Update user roles

### Settings
- `GET /api/user-settings` - Get current user's settings
- `PUT /api/user-settings` - Replace user settings
- `PATCH /api/user-settings` - Partial update user settings
- `GET /api/system-settings` - Get system settings
- `PUT /api/system-settings` - Replace system settings (Admin)
- `PATCH /api/system-settings` - Partial update system settings (Admin)

### Allowlist (Admin-only)
- `GET /api/allowlist` - List allowlisted emails (paginated, filterable)
- `POST /api/allowlist` - Add email to allowlist
- `DELETE /api/allowlist/{id}` - Remove email from allowlist

### Storage Objects
- `POST /api/storage/objects/upload/init` - Initialize resumable upload
- `GET /api/storage/objects/:id/upload/status` - Get upload progress
- `POST /api/storage/objects/:id/upload/complete` - Complete multipart upload
- `DELETE /api/storage/objects/:id/upload/abort` - Abort upload
- `POST /api/storage/objects` - Simple file upload
- `GET /api/storage/objects` - List objects (paginated)
- `GET /api/storage/objects/:id` - Get object metadata
- `GET /api/storage/objects/:id/download` - Get signed download URL
- `DELETE /api/storage/objects/:id` - Delete object
- `PATCH /api/storage/objects/:id/metadata` - Update metadata

### Database Connections
- `GET /api/connections` - List connections (paginated)
- `GET /api/connections/:id` - Get connection by ID
- `POST /api/connections` - Create new connection
- `PATCH /api/connections/:id` - Update connection
- `DELETE /api/connections/:id` - Delete connection
- `POST /api/connections/test` - Test new connection params
- `POST /api/connections/:id/test` - Test existing connection

### Semantic Models
- `GET /api/semantic-models` - List semantic models (paginated)
- `GET /api/semantic-models/:id` - Get semantic model by ID
- `PATCH /api/semantic-models/:id` - Update semantic model
- `DELETE /api/semantic-models/:id` - Delete semantic model
- `GET /api/semantic-models/:id/yaml` - Export as YAML
- `GET /api/semantic-models/:id/runs` - List runs for model
- `POST /api/semantic-models/runs` - Create agent run
- `GET /api/semantic-models/runs/:runId` - Get run status
- `POST /api/semantic-models/runs/:runId/cancel` - Cancel run

### Ontologies
- `GET /api/ontologies` - List ontologies (paginated)
- `GET /api/ontologies/:id` - Get ontology by ID
- `POST /api/ontologies` - Create ontology from semantic model
- `DELETE /api/ontologies/:id` - Delete ontology (both PG and Neo4j)
- `GET /api/ontologies/:id/graph` - Get graph data for visualization

### Schema Discovery
- `GET /api/connections/:id/databases` - List databases
- `GET /api/connections/:id/databases/:db/schemas` - List schemas
- `GET /api/connections/:id/databases/:db/schemas/:schema/tables` - List tables
- `GET /api/connections/:id/databases/:db/schemas/:schema/tables/:table/columns` - List columns

### LLM Providers
- `GET /api/llm/providers` - List enabled LLM providers

### Data Agent
- `GET /api/data-agent/chats` - List chats (paginated)
- `POST /api/data-agent/chats` - Create chat
- `GET /api/data-agent/chats/:id` - Get chat with messages
- `PATCH /api/data-agent/chats/:id` - Update chat name
- `DELETE /api/data-agent/chats/:id` - Delete chat
- `GET /api/data-agent/chats/:id/messages` - List messages (paginated)
- `POST /api/data-agent/chats/:id/messages` - Send message (SSE streaming)
- `POST /api/data-agent/chats/:id/share` - Create public share link
- `GET /api/data-agent/chats/:id/share` - Get share status
- `DELETE /api/data-agent/chats/:id/share` - Revoke share link
- `GET /api/data-agent/share/:shareToken` - View shared chat (Public)
- `GET /api/data-agent/preferences` - List user preferences
- `POST /api/data-agent/preferences` - Create/update preference
- `PATCH /api/data-agent/preferences/:id` - Update preference
- `DELETE /api/data-agent/preferences/:id` - Delete preference
- `DELETE /api/data-agent/preferences` - Clear all preferences

### Spreadsheet Agent
- `GET /api/spreadsheet-agent/projects` - List spreadsheet projects (paginated)
- `POST /api/spreadsheet-agent/projects` - Create a new project
- `GET /api/spreadsheet-agent/projects/:id` - Get project by ID
- `PATCH /api/spreadsheet-agent/projects/:id` - Update project
- `DELETE /api/spreadsheet-agent/projects/:id` - Delete project
- `POST /api/spreadsheet-agent/projects/:id/files` - Upload files to project
- `GET /api/spreadsheet-agent/projects/:id/files` - List project files
- `GET /api/spreadsheet-agent/projects/:id/files/:fileId` - Get file by ID
- `DELETE /api/spreadsheet-agent/projects/:id/files/:fileId` - Delete file
- `GET /api/spreadsheet-agent/projects/:id/tables` - List project tables (paginated)
- `GET /api/spreadsheet-agent/projects/:id/tables/:tableId` - Get table by ID
- `GET /api/spreadsheet-agent/projects/:id/tables/:tableId/preview` - Preview table data
- `GET /api/spreadsheet-agent/projects/:id/tables/:tableId/download` - Get download URL
- `DELETE /api/spreadsheet-agent/projects/:id/tables/:tableId` - Delete table
- `GET /api/spreadsheet-agent/projects/:id/runs` - List project runs (paginated)
- `GET /api/spreadsheet-agent/runs` - List all runs (paginated)
- `POST /api/spreadsheet-agent/runs` - Create agent run
- `GET /api/spreadsheet-agent/runs/:runId` - Get run status
- `DELETE /api/spreadsheet-agent/runs/:runId` - Delete run (failed/cancelled only)
- `POST /api/spreadsheet-agent/runs/:runId/cancel` - Cancel run
- `POST /api/spreadsheet-agent/runs/:runId/approve` - Approve extraction plan
- `POST /api/spreadsheet-agent/runs/:runId/stream` - SSE stream (run execution)

### Data Imports
- `POST /api/data-imports/upload` - Upload CSV/Excel file
- `GET /api/data-imports` - List imports (paginated)
- `GET /api/data-imports/:id` - Get import by ID
- `GET /api/data-imports/:id/preview` - Get parse result
- `POST /api/data-imports/:id/preview` - Excel sheet/range preview (no persist)
- `PATCH /api/data-imports/:id` - Update import config
- `DELETE /api/data-imports/:id` - Delete import
- `POST /api/data-imports/runs` - Create import run
- `GET /api/data-imports/:id/runs` - List runs for import
- `GET /api/data-imports/runs/:runId` - Get run status
- `POST /api/data-imports/runs/:runId/cancel` - Cancel run
- `DELETE /api/data-imports/runs/:runId` - Delete run (failed/cancelled only)
- `POST /api/data-imports/runs/:runId/stream` - SSE stream (execute import)

### Health
- `GET /api/health/live` - Liveness check
- `GET /api/health/ready` - Readiness check (includes DB)

## RBAC Model

### Roles
- **Admin**: Full access, manage users and system settings; full access to all spreadsheet agent projects
- **Contributor**: Standard capabilities, manage own settings (default for new users); full read/write/delete on own spreadsheet projects
- **Viewer**: Least privilege, manage own settings; read-only access to spreadsheet agent projects

### Key Permissions
- `system_settings:read/write` - System settings access
- `user_settings:read/write` - User settings access
- `users:read/write` - User management
- `rbac:manage` - Role assignment
- `allowlist:read/write` - Allowlist management (Admin only)
- `storage:read/write/delete` - Storage object access (own objects)
- `storage:read_any/write_any/delete_any` - Storage object access (all objects, Admin only)
- `connections:read/write/delete/test` - Database connection management
- `semantic_models:read/write/delete/generate` - Semantic model management
- `ontologies:read/write/delete` - Ontology management
- `data_agent:read/write/delete` - Data Agent chat management
- `spreadsheet_agent:read/write/delete` - Spreadsheet project management
- `data_imports:read/write/delete` - Data import management

## Database Tables

- `users` - User accounts with profile info
- `user_identities` - OAuth provider identities (provider + subject)
- `roles` / `permissions` / `role_permissions` - RBAC
- `user_roles` - User-to-role assignments
- `system_settings` - Global app settings (JSONB)
- `user_settings` - Per-user settings (JSONB)
- `audit_events` - Action audit log
- `refresh_tokens` - JWT refresh tokens (hashed)
- `allowed_emails` - Allowlist for access control
- `device_codes` - Device authorization codes (RFC 8628)
- `storage_objects` - File metadata, status, storage references
- `storage_object_chunks` - Multipart upload chunk tracking
- `data_connections` - Database connection configurations (system-level, encrypted credentials)
- `semantic_models` - AI-generated semantic models (OSI spec, JSON model, system-level)
- `semantic_model_runs` - Agent execution tracking (status, plan, progress)
- `ontologies` - Graph ontology metadata (status, counts, link to semantic model)
- `data_chats` - Data Agent chat conversations (owner, ontology, LLM provider)
- `data_chat_messages` - Chat messages with metadata (phase artifacts, clarification)
- `data_agent_preferences` - Per-user agent preferences (global and ontology-scoped)
- `data_chat_shares` - Public chat share links (token, expiry, view count, revocation)
- `spreadsheet_projects` - Spreadsheet extraction project metadata (status, storage config)
- `spreadsheet_files` - Source files uploaded to projects
- `spreadsheet_tables` - Extracted output tables (Parquet)
- `spreadsheet_runs` - Agent execution tracking (status, plan, progress)
- `data_imports` - Data import metadata (source file, config, output tables, status)
- `data_import_runs` - Import execution tracking (status, progress, phases)

## Access Control: Email Allowlist

The application uses an **email allowlist** to restrict access to pre-authorized users only.

### How It Works
1. Admins add email addresses to the allowlist before users can login
2. During OAuth login, the user's email is checked against the allowlist
3. If the email is not in the allowlist, login is denied with a clear error message
4. Exception: `INITIAL_ADMIN_EMAIL` always bypasses the allowlist check

### Configuration
- `INITIAL_ADMIN_EMAIL` environment variable grants initial admin access
- This email is automatically added to the allowlist during database seeding

### Admin Management
- Access allowlist management at `/admin/users` (Allowlist tab)
- Two tabs available:
  - **Users**: Manage existing registered users
  - **Allowlist**: Pre-authorize email addresses for future logins

### Status Tracking
- **Pending**: Email added to allowlist but user hasn't logged in yet
- **Claimed**: User has successfully logged in and created an account
- Claimed entries cannot be removed (prevents accidentally removing existing user access)

## Security Guidelines

- Secrets via environment variables only (see `.env.example`)
- JWT access tokens are short-lived (15 min default)
- Refresh tokens in HttpOnly cookies with rotation
- Input validation on all endpoints
- File uploads: images only, size/type limits, randomized filenames
- Email allowlist restricts application access to pre-authorized users

## Testing Requirements

- Unit tests: isolated logic (services, guards, validators)
- Integration tests: API + DB + RBAC flows with test DB
- Mock OAuth in CI (no real Google dependency)
- Frontend: component and hook tests

## Environment Variables

Key variables (see `infra/compose/.env.example` for full list):

**Application:**
- `NODE_ENV` - Environment (development/production)
- `PORT` - API port (default: 3000)
- `APP_URL` - Base URL (default: http://localhost:8319)

**Database (individual connection parameters):**
- `POSTGRES_HOST` - Database hostname (default: db in Docker, localhost otherwise)
- `POSTGRES_PORT` - Database port (default: 5432)
- `POSTGRES_USER` - Database user (default: postgres)
- `POSTGRES_PASSWORD` - Database password (default: postgres)
- `POSTGRES_DB` - Database name (default: appdb)
- `POSTGRES_SSL` - Enable SSL connection (default: false)

Note: `DATABASE_URL` is constructed automatically from these variables at runtime.

**Graph Database (Neo4j):**
- `NEO4J_USER` - Neo4j username (default: neo4j)
- `NEO4J_PASSWORD` - Neo4j password (default: neo4j)

**Authentication:**
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `JWT_ACCESS_TTL_MINUTES` - Access token TTL (default: 15)
- `JWT_REFRESH_TTL_DAYS` - Refresh token TTL (default: 14)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
- `INITIAL_ADMIN_EMAIL` - First user with this email becomes Admin
- `DEVICE_CODE_EXPIRY_MINUTES` - Device code lifetime (default: 15)
- `DEVICE_CODE_POLL_INTERVAL` - Device polling interval in seconds (default: 5)

**Encryption:**
- `ENCRYPTION_KEY` - 32-byte key for AES-256-GCM encryption of connection credentials

**LLM Providers:**
- `LLM_DEFAULT_PROVIDER` - Default LLM provider (openai|anthropic|azure)
- `OPENAI_API_KEY` / `OPENAI_MODEL` - OpenAI configuration
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` - Anthropic configuration
- `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_DEPLOYMENT` / `AZURE_OPENAI_API_VERSION` - Azure OpenAI configuration

**Observability:**
- `OTEL_ENABLED` - Enable OpenTelemetry (default: true)
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTEL Collector endpoint
- `UPTRACE_DSN` - Uptrace connection string

## Common Patterns

### Adding a New API Endpoint
1. Create controller method with decorators for auth/RBAC
2. Add service method with business logic
3. Update OpenAPI annotations
4. Add unit + integration tests
5. Update API.md if needed

### Adding a New Setting
1. Update Zod schema for validation
2. Add migration if schema structure changes
3. Update TypeScript types
4. Add frontend UI if user-facing

## Specialized Subagents (MANDATORY)

**CRITICAL REQUIREMENT**: This project uses specialized subagents for all development work. You MUST delegate tasks to the appropriate subagent. Do NOT attempt to perform development tasks directly without using the designated agent.

### Why Subagents Are Mandatory
- Each agent contains domain-specific knowledge from the System Specification
- Agents ensure consistent patterns and conventions across the codebase
- Agents have the full context needed for their specialized area
- Direct implementation without agents risks missing requirements

### Available Agents

| Agent | Domain | MUST Use For |
|-------|--------|--------------|
| `backend-dev` | NestJS API, Fastify, auth, RBAC | **ANY** backend code: endpoints, services, guards, middleware, JWT, OAuth |
| `frontend-dev` | React, MUI, TypeScript | **ANY** frontend code: components, pages, hooks, theming, responsive design |
| `database-dev` | PostgreSQL, Prisma | **ANY** database work: schema changes, migrations, seeds, queries |
| `testing-dev` | Jest, Supertest, RTL | **ANY** testing: unit tests, integration tests, typecheck, test fixtures |
| `docs-dev` | Technical documentation | **ANY** documentation: ARCHITECTURE.md, SECURITY.md, API.md, README updates |

### Mandatory Delegation Rules

1. **Backend code changes** → ALWAYS use `backend-dev`
2. **Frontend code changes** → ALWAYS use `frontend-dev`
3. **Database/Prisma changes** → ALWAYS use `database-dev`
4. **Writing or updating tests** → ALWAYS use `testing-dev`
5. **Documentation updates** → ALWAYS use `docs-dev`

### Multi-Domain Tasks

For tasks spanning multiple domains, you MUST invoke multiple agents sequentially:

**Example: "Add a new user preference setting"**
1. `database-dev` → Add migration for schema change
2. `backend-dev` → Implement API endpoint
3. `frontend-dev` → Build UI component
4. `testing-dev` → Write tests for all layers
5. `docs-dev` → Update API documentation

### Usage Examples
```
# Backend work - MUST use backend-dev
"Use backend-dev to implement the user settings endpoint"

# Frontend work - MUST use frontend-dev
"Use frontend-dev to create the theme toggle component"

# Database work - MUST use database-dev
"Use database-dev to add audit_events table migration"

# Testing work - MUST use testing-dev
"Use testing-dev to write integration tests for auth"

# Documentation work - MUST use docs-dev
"Use docs-dev to update SECURITY.md with new auth flow"
```

### What You Should NOT Do Directly
- Do NOT write NestJS controllers, services, or guards without `backend-dev`
- Do NOT create React components or pages without `frontend-dev`
- Do NOT modify Prisma schema or create migrations without `database-dev`
- Do NOT write Jest/RTL tests without `testing-dev`
- Do NOT update documentation files without `docs-dev`

The only exceptions are:
- Reading files to understand context
- Answering questions about the codebase
- Planning and coordination between agents
- Running simple commands (git status, npm install, etc.)
