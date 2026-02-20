# Knecta

**Knecta** (pronounced *"connect-a"*) is an open platform that connects your databases and turns them into an askable knowledge layer. Ask questions in plain English, get trusted answers backed by traceable SQL and full data lineage.

## The Problem

Getting answers from structured data shouldn't require writing SQL. But today, non-technical users depend on analysts and engineers to query databases, wait for reports, and hope they asked the right question. Even technical users waste time reverse-engineering unfamiliar schemas, guessing column meanings, and validating join logic by hand.

Traditional text-to-SQL tools attempt to solve this but fall short: they hallucinate column names, produce incorrect joins, and have no way to verify their own output. The result is answers that look right but can't be trusted.

## How Knecta Solves It

Knecta takes an **ontology-based approach** that provides proper guardrails at every step, ensuring queries are structurally correct before they ever touch your database.

### The Pipeline

```
Connect  ──>  Understand  ──>  Model  ──>  Ask
```

1. **Connect** your databases (PostgreSQL, MySQL, SQL Server, Databricks, Snowflake). Credentials are stored with AES-256-GCM encryption and validated before saving.

2. **Understand** the schema automatically. An AI agent introspects tables, columns, data types, foreign keys, and sample data, building a rich [semantic model](https://en.wikipedia.org/wiki/Semantic_data_model) that captures not just structure, but meaning and relationships.

3. **Model** the data as a graph ontology (Neo4j). Datasets become nodes, relationships become edges. This graph is the single source of truth for how your data connects, eliminating guesswork and hallucinated joins.

4. **Ask** questions in plain English. A multi-phase AI agent uses the ontology to decompose your question, discover the right datasets, build validated SQL, execute it, verify the results, and explain the answer with full data lineage.

### Why Ontology-Based?

The ontology is what makes Knecta different from naive text-to-SQL:

- **No hallucinated columns or joins.** The agent can only reference columns and relationships that exist in the ontology. If the data isn't there, it tells you instead of guessing.
- **Verified results.** A dedicated verification phase generates Python checks for grain correctness, join explosion, NULL ratios, and result reasonableness. Failures trigger automatic revision, not silent errors.
- **Scale through structure.** The ontology graph enables efficient join-path discovery even across dozens of interconnected datasets. The agent navigates relationships programmatically rather than asking the LLM to memorize schema details.
- **Consistent answers.** The semantic model defines canonical column names, types, and expressions. Every query is built against this authoritative definition, so the same question always produces the same query structure.

### The Data Agent: Six Phases, Not One Prompt

Unlike simple text-to-SQL that sends one prompt and hopes for the best, Knecta's data agent uses a structured six-phase pipeline:

| Phase | What it does |
|-------|-------------|
| **Planner** | Decomposes complex questions into ordered sub-tasks. Identifies when clarification is needed before running expensive queries. |
| **Navigator** | Discovers which datasets to use by exploring the ontology graph. Finds join paths between tables. Acts as the sole gatekeeper: if the ontology can't answer the question, it stops here. |
| **SQL Builder** | Generates SQL using only ontology-validated columns and joins. Validates every column reference against the semantic model YAML. |
| **Executor** | Runs a pilot query (10 rows) first to catch errors cheaply, then executes the full query against the source database. |
| **Verifier** | Generates and runs Python validation checks. If results fail verification, the pipeline loops back (up to 3 revisions) to fix the query. |
| **Explainer** | Synthesizes a natural-language answer with charts when helpful, and provides full data lineage showing exactly which tables, joins, filters, and time windows were used. |

## Features

- **Multi-database support** - PostgreSQL, MySQL, SQL Server, Databricks, Snowflake
- **AI-powered semantic modeling** - Automatically discovers schema, relationships, and business context
- **Graph ontology** - Neo4j-backed knowledge graph with interactive visualization
- **Natural language querying** - Ask questions in English, get SQL-backed answers
- **Interactive charts** - Auto-generated bar, line, pie, and scatter charts via MUI X Charts
- **Mandatory verification** - Python-based validation catches errors before they reach users
- **Data lineage** - Every answer traces back to specific datasets, joins, and filters
- **Clarifying questions** - The agent asks for clarification when the question is ambiguous, saving compute and improving accuracy
- **User preferences** - The agent learns your terminology and conventions over time
- **Real-time progress** - SSE streaming shows phase-by-phase execution as it happens
- **Multi-provider LLM support** - OpenAI, Anthropic, and Azure OpenAI with per-chat selection
- **Enterprise auth** - Google OAuth, JWT tokens, role-based access control (Admin / Contributor / Viewer)
- **Encrypted credentials** - AES-256-GCM encryption for all stored database credentials
- **Audit trail** - All actions logged for compliance

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Material UI, MUI X Charts |
| Backend | NestJS, Fastify, TypeScript |
| Database | PostgreSQL (Prisma ORM) |
| Graph DB | Neo4j |
| AI/Agent | LangGraph, LangChain, OpenAI / Anthropic / Azure |
| Auth | Passport (Google OAuth), JWT |
| Infrastructure | Docker, Nginx, OpenTelemetry |

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Google OAuth credentials (for authentication)
- At least one LLM provider API key (OpenAI, Anthropic, or Azure OpenAI)

### Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> && cd Knecta

# 2. Copy and configure environment variables
cp infra/compose/.env.example infra/compose/.env
# Edit .env with your Google OAuth credentials, LLM API keys, etc.

# 3. Start the development stack
cd infra/compose
docker compose -f base.compose.yml -f dev.compose.yml up
```

The application will be available at **http://localhost:8319**.

### Service URLs

| Service | URL |
|---------|-----|
| Application | http://localhost:8319 |
| API Docs (Swagger) | http://localhost:8319/api/docs |
| Neo4j Browser | http://localhost:7474 |

## Repository Structure

```
Knecta/
  apps/
    api/          # NestJS backend (Fastify adapter)
    web/          # React frontend (Vite)
  docs/           # Specifications and documentation
  infra/          # Docker Compose, Nginx, observability config
```

## Running Tests

```bash
# Backend tests (Jest + Supertest)
cd apps/api && npm test

# Frontend tests (Vitest + React Testing Library)
cd apps/web && npm test
```

## License

All rights reserved.
