# MCP Server Feature Specification

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture](#architecture)
3. [Authentication](#authentication)
4. [Discovery Endpoints](#discovery-endpoints)
5. [Setup Guide](#setup-guide)
6. [Resources](#resources)
7. [Tools](#tools)
8. [Chart Data Format](#chart-data-format)
9. [Clarification Flow](#clarification-flow)
10. [Session Management](#session-management)
11. [RBAC & Permissions](#rbac--permissions)
12. [Error Handling](#error-handling)
13. [Testing with MCP Inspector](#testing-with-mcp-inspector)
14. [API Endpoints](#api-endpoints)
15. [Security](#security)
16. [Configuration](#configuration)
17. [File Inventory](#file-inventory)
18. [Testing](#testing)
19. [Packages](#packages)

---

## Feature Overview

The Knecta MCP server exposes the Data Agent analytical pipeline via the Model Context Protocol (MCP), enabling external AI clients (ChatGPT, Claude Desktop, Cursor, etc.) to query data through the same multi-phase agent architecture used by the Knecta web UI.

### Core Capabilities

- **OAuth 2.1 Authentication**: RFC 8252 compliant authorization with PKCE S256
- **MCP Resources**: Browse ontologies and dataset schemas
- **MCP Tools**: Execute natural language queries via `ask_question` tool
- **Multi-Phase Agent Pipeline**: Same 6-phase architecture (Planner, Navigator, SQL Builder, Executor, Verifier, Explainer)
- **Structured Chart Data**: Returns ChartSpec objects with rendering guidance
- **Data Lineage**: Full audit trail of datasets, joins, filters, and grain
- **Clarification Support**: Agent can request clarifying questions from the client
- **Session Isolation**: Per-client MCP server instances with captured permissions
- **Streamable HTTP Transport**: Server-Sent Events for bidirectional communication

### Supported Clients

Any MCP client implementing the Streamable HTTP transport specification:
- Claude Desktop
- ChatGPT (with MCP plugin)
- Cursor IDE
- Continue.dev
- Custom MCP clients

### Why MCP?

MCP provides a standardized way for AI applications to access external data sources and tools. By exposing Knecta's Data Agent through MCP:

1. Users can query their data from their preferred AI assistant
2. External tools can integrate Knecta's analytical capabilities
3. No need to build custom integrations per client
4. Standardized authentication and discovery mechanisms

---

## Architecture

The MCP server is implemented as a NestJS module with OAuth 2.1 authorization server and streamable HTTP transport:

```
┌────────────────────────────────────────────────────────────────┐
│  MCP Client (ChatGPT, Claude Desktop, Cursor)                  │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     │ OAuth 2.1 (authorization_code + PKCE S256)
                     │
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  Knecta API Server                                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  OAuth 2.1 Authorization Server                          │ │
│  │  /api/oauth/authorize                                     │ │
│  │  /api/oauth/token                                         │ │
│  │  /.well-known/protected-resource (Nginx proxied)         │ │
│  │  /.well-known/authorization-server (Nginx proxied)       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  MCP Server Module                                        │ │
│  │  POST /api/data-agent/mcp (create session)               │ │
│  │  POST /api/data-agent/mcp (send message)                 │ │
│  │  GET  /api/data-agent/mcp (read response)                │ │
│  │  DELETE /api/data-agent/mcp (terminate session)          │ │
│  │                                                            │ │
│  │  McpAuthGuard: Bearer JWT validation                      │ │
│  │  → Requires: data_agent:read, ontologies:read            │ │
│  │                                                            │ │
│  │  Resources:                                                │ │
│  │  ├─ knecta://ontologies                                   │ │
│  │  ├─ knecta://ontologies/{id}                              │ │
│  │  └─ knecta://ontologies/{id}/datasets/{name}             │ │
│  │                                                            │ │
│  │  Tools:                                                    │ │
│  │  └─ ask_question(ontologyId, question)                    │ │
│  │     → DataAgentAgentService.executeAgent()                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Data Agent Pipeline                                      │ │
│  │  Planner → Navigator → SQL Builder → Executor →           │ │
│  │  Verifier → Explainer                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Data Sources                                             │ │
│  │  PostgreSQL (Prisma) | Neo4j (Ontology) | User DB        │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **OAuth 2.1 Authorization Server** (`apps/api/src/oauth/`)
   - Issues authorization codes with PKCE S256 validation
   - Mints JWT access tokens and refresh tokens
   - Provides RFC 8414 discovery metadata

2. **MCP Server Module** (`apps/api/src/mcp/`)
   - Implements MCP SDK Server with Streamable HTTP transport
   - Session-based server instances with captured user permissions
   - Resource providers for ontologies and datasets
   - Tool handler for `ask_question` delegating to Data Agent

3. **McpAuthGuard** (`apps/api/src/mcp/mcp-auth.guard.ts`)
   - Validates Bearer JWT from Authorization header
   - Enforces required permissions (`data_agent:read`, `ontologies:read`)
   - Sets RFC 9110 `WWW-Authenticate` header on 401 with resource_metadata URL

4. **Data Agent Integration**
   - Reuses existing `DataAgentAgentService.executeAgent()`
   - Auto-generates chat titles: `MCP: <clientName> — <question preview>`
   - Uses user's `defaultProvider` from UserSettings
   - Returns narrative + ChartSpec[] + dataLineage

---

## Authentication

The MCP server uses OAuth 2.1 with PKCE (RFC 7636) and protected resource metadata discovery (RFC 9470).

### OAuth 2.1 Flow (Step-by-Step)

#### Step 1: Client Attempts MCP Connection

The client sends an initial request to the MCP endpoint without credentials:

```http
POST /api/data-agent/mcp HTTP/1.1
Host: knecta.example.com
Content-Type: application/json
```

**Server Response (401 Unauthorized):**

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://knecta.example.com/.well-known/oauth-protected-resource/api/data-agent/mcp"
Content-Type: application/json

{
  "error": "unauthorized",
  "message": "No authorization token provided"
}
```

#### Step 2: Discover Protected Resource Metadata

The client fetches the resource metadata URL from the `WWW-Authenticate` header:

```http
GET /.well-known/oauth-protected-resource/api/data-agent/mcp HTTP/1.1
Host: knecta.example.com
```

**Server Response:**

```json
{
  "resource": "https://knecta.example.com/api/data-agent/mcp",
  "authorization_servers": ["https://knecta.example.com"],
  "scopes_supported": [
    "data_agent:read",
    "data_agent:write",
    "ontologies:read"
  ],
  "bearer_methods_supported": ["header"]
}
```

#### Step 3: Discover Authorization Server Metadata

The client fetches the authorization server metadata:

```http
GET /.well-known/oauth-authorization-server HTTP/1.1
Host: knecta.example.com
```

**Server Response:**

```json
{
  "issuer": "https://knecta.example.com",
  "authorization_endpoint": "https://knecta.example.com/api/oauth/authorize",
  "token_endpoint": "https://knecta.example.com/api/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": [
    "data_agent:read",
    "data_agent:write",
    "ontologies:read"
  ],
  "token_endpoint_auth_methods_supported": ["none"],
  "client_id_metadata_document_supported": true
}
```

#### Step 4: Generate PKCE Parameters

The client generates PKCE parameters:

```typescript
// Generate code_verifier (43-128 characters, URL-safe)
const code_verifier = generateRandomString(64);

// Generate code_challenge (SHA256 hash, base64url-encoded)
const code_challenge = base64url(sha256(code_verifier));
const code_challenge_method = 'S256';
```

#### Step 5: Authorization Request

The client redirects the user to the authorization endpoint:

```http
GET /api/oauth/authorize?
  response_type=code&
  client_id=my-mcp-client&
  redirect_uri=http://localhost:3000/callback&
  scope=data_agent:read data_agent:write ontologies:read&
  state=abc123&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256
HTTP/1.1
Host: knecta.example.com
```

**If User Not Logged In:**

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "login_required",
  "login_url": "https://knecta.example.com/api/auth/google",
  "message": "User must login before authorizing application"
}
```

The client should redirect the user to `login_url`. After successful Google OAuth login, the user should retry the authorization request.

**If User Already Logged In:**

The server generates an authorization code and redirects:

```http
HTTP/1.1 302 Found
Location: http://localhost:3000/callback?code=auth_abc123xyz&state=abc123
```

#### Step 6: Token Exchange

The client exchanges the authorization code for tokens:

```http
POST /api/oauth/token HTTP/1.1
Host: knecta.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=auth_abc123xyz&
redirect_uri=http://localhost:3000/callback&
client_id=my-mcp-client&
code_verifier=abc123...xyz
```

**Server Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "refresh_abc123xyz",
  "scope": "data_agent:read data_agent:write ontologies:read"
}
```

#### Step 7: Use Access Token

The client includes the access token in all MCP requests:

```http
POST /api/data-agent/mcp HTTP/1.1
Host: knecta.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list"
}
```

#### Step 8: Refresh Token

When the access token expires, use the refresh token:

```http
POST /api/oauth/token HTTP/1.1
Host: knecta.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=refresh_abc123xyz&
client_id=my-mcp-client
```

**Server Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "refresh_new456def",
  "scope": "data_agent:read data_agent:write ontologies:read"
}
```

### Security Properties

- **PKCE S256**: Prevents authorization code interception attacks
- **State Parameter**: CSRF protection
- **Short-lived Access Tokens**: 15 minutes (configurable via `JWT_ACCESS_TTL_MINUTES`)
- **Refresh Token Rotation**: New refresh token issued with each refresh
- **No Client Secret**: Public clients use PKCE instead of static secrets
- **Audience Validation**: JWT includes `aud` claim for resource validation

---

## Discovery Endpoints

The MCP server implements RFC 9470 (Protected Resource Metadata) and RFC 8414 (Authorization Server Metadata) for OAuth 2.1 discovery.

### Protected Resource Metadata

**Endpoint:** `GET /.well-known/oauth-protected-resource/api/data-agent/mcp`

**Response:**

```json
{
  "resource": "https://knecta.example.com/api/data-agent/mcp",
  "authorization_servers": ["https://knecta.example.com"],
  "scopes_supported": [
    "data_agent:read",
    "data_agent:write",
    "ontologies:read"
  ],
  "bearer_methods_supported": ["header"]
}
```

**Fields:**

- `resource` — Canonical URL of the protected resource
- `authorization_servers` — Array of authorization server URLs
- `scopes_supported` — OAuth scopes required for access
- `bearer_methods_supported` — How to send the Bearer token (`header` only)

### Authorization Server Metadata

**Endpoint:** `GET /.well-known/oauth-authorization-server`

**Response:**

```json
{
  "issuer": "https://knecta.example.com",
  "authorization_endpoint": "https://knecta.example.com/api/oauth/authorize",
  "token_endpoint": "https://knecta.example.com/api/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": [
    "data_agent:read",
    "data_agent:write",
    "ontologies:read"
  ],
  "token_endpoint_auth_methods_supported": ["none"],
  "client_id_metadata_document_supported": true
}
```

**Fields:**

- `issuer` — Authorization server identifier (must match JWT `iss` claim)
- `authorization_endpoint` — URL for authorization code flow initiation
- `token_endpoint` — URL for token exchange
- `response_types_supported` — Only `code` (authorization code flow)
- `grant_types_supported` — `authorization_code` and `refresh_token`
- `code_challenge_methods_supported` — Only `S256` (SHA256 PKCE)
- `scopes_supported` — Available OAuth scopes
- `token_endpoint_auth_methods_supported` — `none` (public clients, PKCE required)
- `client_id_metadata_document_supported` — Dynamic client registration support

### Nginx Proxy Configuration

The `.well-known` endpoints are served by the API but must be accessible at the root path. Nginx proxies these requests:

```nginx
# Proxy /.well-known/ to API
location /.well-known/ {
    proxy_pass http://api_upstream/api/oauth/.well-known/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Important:** The trailing slashes are required for correct path rewriting.

---

## Setup Guide

### Prerequisites

- Knecta API server running with OAuth configured
- HTTPS enabled (required for OAuth 2.1)
- At least one ontology created
- User account with `data_agent:read`, `data_agent:write`, and `ontologies:read` permissions

### Environment Variables

Add these to `infra/compose/.env`:

```bash
# OAuth 2.1
OAUTH_AUTHORIZATION_CODE_TTL_MINUTES=10
OAUTH_DEVICE_CODE_TTL_MINUTES=15

# JWT tokens (already configured for existing auth)
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=14
```

### Nginx Configuration

Add the MCP endpoint proxy configuration to `infra/nginx/nginx.conf`:

```nginx
# MCP endpoint with SSE support
location /api/data-agent/mcp {
    proxy_pass http://api_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    # Disable buffering for SSE
    proxy_buffering off;
    proxy_cache off;

    # Increase timeouts for long-running agent execution
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}

# OAuth discovery endpoints
location /.well-known/ {
    proxy_pass http://api_upstream/api/oauth/.well-known/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Restart Services

```bash
cd infra/compose
docker compose -f base.compose.yml -f dev.compose.yml down
docker compose -f base.compose.yml -f dev.compose.yml up
```

### Connecting a Client (Example: Claude Desktop)

1. **Find your Claude Desktop config file:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add the MCP server:**

```json
{
  "mcpServers": {
    "knecta": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "https://knecta.example.com/api/data-agent/mcp"
      ],
      "env": {
        "MCP_AUTH_OAUTH": "true"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

4. **First Connection:**
   - Claude Desktop will detect OAuth is required
   - It will open your browser to the authorization endpoint
   - If not logged in, you'll be redirected to Google OAuth
   - After login, authorize the application
   - Claude Desktop will receive the access token and connect

5. **Test the Connection:**
   - In Claude Desktop, ask: "What ontologies are available?"
   - Claude will use the `knecta://ontologies` resource
   - Then ask a question: "Show me sales by region"
   - Claude will use the `ask_question` tool

### Connecting a Custom Client

For custom MCP clients, use the `@modelcontextprotocol/sdk` TypeScript package:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPTransport } from '@modelcontextprotocol/sdk/client/transports.js';

// 1. Perform OAuth 2.1 flow (see Authentication section)
const accessToken = await performOAuthFlow();

// 2. Create MCP client
const transport = new StreamableHTTPTransport(
  new URL('https://knecta.example.com/api/data-agent/mcp'),
  {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }
);

const client = new Client({
  name: 'my-client',
  version: '1.0.0',
}, {
  capabilities: {
    resources: {},
    tools: {},
  },
});

await client.connect(transport);

// 3. List resources
const resources = await client.listResources();
console.log(resources);

// 4. Call ask_question tool
const result = await client.callTool({
  name: 'ask_question',
  arguments: {
    ontologyId: 'uuid-of-ontology',
    question: 'What were total sales last quarter?',
  },
});

console.log(result);
```

---

## Resources

MCP resources allow clients to browse available ontologies and dataset schemas.

### Resource URI Templates

| URI Template | Description |
|--------------|-------------|
| `knecta://ontologies` | List all ready ontologies |
| `knecta://ontologies/{id}` | Get ontology metadata and datasets |
| `knecta://ontologies/{id}/datasets/{name}` | Get full YAML schema for a dataset |

### Resource 1: List Ontologies

**URI:** `knecta://ontologies`

**Description:** Returns a JSON array of all ontologies in `ready` status that the user has access to.

**MCP Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/read",
  "params": {
    "uri": "knecta://ontologies"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "contents": [
      {
        "uri": "knecta://ontologies",
        "mimeType": "application/json",
        "text": "[{\"id\":\"uuid-1\",\"name\":\"Sales Analytics\",\"description\":\"Sales and customer data\",\"datasetCount\":5,\"fieldCount\":42},{\"id\":\"uuid-2\",\"name\":\"Marketing Metrics\",\"description\":\"Campaign and conversion data\",\"datasetCount\":3,\"fieldCount\":28}]"
      }
    ]
  }
}
```

**Parsed JSON:**

```json
[
  {
    "id": "uuid-1",
    "name": "Sales Analytics",
    "description": "Sales and customer data",
    "datasetCount": 5,
    "fieldCount": 42
  },
  {
    "id": "uuid-2",
    "name": "Marketing Metrics",
    "description": "Campaign and conversion data",
    "datasetCount": 3,
    "fieldCount": 28
  }
]
```

**Fields:**

- `id` — Ontology UUID
- `name` — Ontology name
- `description` — Human-readable description (nullable)
- `datasetCount` — Number of Dataset nodes in the graph
- `fieldCount` — Number of Field nodes in the graph

### Resource 2: Ontology Details

**URI:** `knecta://ontologies/{id}`

**Description:** Returns ontology metadata plus a list of all datasets with basic information.

**MCP Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "knecta://ontologies/uuid-1"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "knecta://ontologies/uuid-1",
        "mimeType": "application/json",
        "text": "{\"ontology\":{\"id\":\"uuid-1\",\"name\":\"Sales Analytics\",\"description\":\"Sales and customer data\"},\"datasets\":[{\"name\":\"orders\",\"description\":\"Customer orders\",\"source\":\"schema.orders\"},{\"name\":\"customers\",\"description\":\"Customer profiles\",\"source\":\"schema.customers\"}]}"
      }
    ]
  }
}
```

**Parsed JSON:**

```json
{
  "ontology": {
    "id": "uuid-1",
    "name": "Sales Analytics",
    "description": "Sales and customer data"
  },
  "datasets": [
    {
      "name": "orders",
      "description": "Customer orders",
      "source": "schema.orders"
    },
    {
      "name": "customers",
      "description": "Customer profiles",
      "source": "schema.customers"
    }
  ]
}
```

**Fields:**

- `ontology.id` — Ontology UUID
- `ontology.name` — Ontology name
- `ontology.description` — Description (nullable)
- `datasets[].name` — Dataset logical name
- `datasets[].description` — Dataset description (nullable)
- `datasets[].source` — Physical table name (schema.table)

### Resource 3: Dataset Schema

**URI:** `knecta://ontologies/{ontologyId}/datasets/{datasetName}`

**Description:** Returns the full YAML schema for a specific dataset, including all fields with types, descriptions, and expressions.

**MCP Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/read",
  "params": {
    "uri": "knecta://ontologies/uuid-1/datasets/orders"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "contents": [
      {
        "uri": "knecta://ontologies/uuid-1/datasets/orders",
        "mimeType": "text/yaml",
        "text": "name: orders\ndescription: Customer orders\nsource:\n  table: public.orders\nfields:\n  - name: order_id\n    type: number\n    description: Unique order identifier\n    source_column: order_id\n  - name: customer_id\n    type: number\n    description: Reference to customer\n    source_column: customer_id\n  - name: order_date\n    type: date\n    description: Date order was placed\n    source_column: order_date\n  - name: total_amount\n    type: number\n    description: Total order value in USD\n    source_column: total_amount\n"
      }
    ]
  }
}
```

**YAML Schema Format:**

```yaml
name: orders
description: Customer orders
source:
  table: public.orders
fields:
  - name: order_id
    type: number
    description: Unique order identifier
    source_column: order_id
  - name: customer_id
    type: number
    description: Reference to customer
    source_column: customer_id
  - name: order_date
    type: date
    description: Date order was placed
    source_column: order_date
  - name: total_amount
    type: number
    description: Total order value in USD
    source_column: total_amount
```

**Use Case:** Clients can use this schema to understand available fields and their types before asking questions.

---

## Tools

MCP tools allow clients to execute actions on the server. The Knecta MCP server exposes a single tool: `ask_question`.

### Tool: ask_question

**Name:** `ask_question`

**Description:** Execute a natural language query against an ontology using the multi-phase Data Agent pipeline.

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "ontologyId": {
      "type": "string",
      "description": "UUID of the ontology to query",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    },
    "question": {
      "type": "string",
      "description": "Natural language question about the data",
      "minLength": 1,
      "maxLength": 2000
    }
  },
  "required": ["ontologyId", "question"]
}
```

**MCP Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "ask_question",
    "arguments": {
      "ontologyId": "uuid-1",
      "question": "What were total sales by region last quarter?"
    }
  }
}
```

**Response Structure:**

The response contains multiple text content blocks, each representing a different aspect of the answer:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "## Sales by Region (Q4 2025)\n\nTotal sales last quarter were $4.2M across 4 regions:\n\n- **West**: $1.8M (43%)\n- **East**: $1.2M (29%)\n- **South**: $800K (19%)\n- **North**: $400K (9%)\n\nThe West region significantly outperformed others, accounting for nearly half of total sales."
      },
      {
        "type": "text",
        "text": "{\"_type\":\"chart_specs\",\"charts\":[{\"type\":\"bar\",\"title\":\"Sales by Region\",\"xAxisLabel\":\"Region\",\"yAxisLabel\":\"Total Sales ($)\",\"categories\":[\"West\",\"East\",\"South\",\"North\"],\"series\":[{\"label\":\"Q4 2025\",\"data\":[1800000,1200000,800000,400000]}]}]}"
      },
      {
        "type": "text",
        "text": "{\"_type\":\"data_lineage\",\"datasets\":[{\"name\":\"orders\",\"source\":\"public.orders\"}],\"joins\":[],\"filters\":[{\"field\":\"order_date\",\"operator\":\">=\",\"value\":\"2025-10-01\"},{\"field\":\"order_date\",\"operator\":\"<\",\"value\":\"2026-01-01\"}],\"timeWindow\":{\"start\":\"2025-10-01\",\"end\":\"2025-12-31\"},\"grain\":\"region\"}"
      }
    ],
    "isError": false
  }
}
```

**Content Block Types:**

1. **Narrative (type: "text", markdown)**
   - The human-readable answer to the question
   - Uses markdown formatting
   - Always the first content block
   - May include tables, lists, headings

2. **Chart Specifications (type: "text", JSON with `_type: "chart_specs"`)**
   - Structured chart data for visualization
   - See [Chart Data Format](#chart-data-format) for details
   - Only present if the agent generated charts
   - Must be parsed as JSON

3. **Data Lineage (type: "text", JSON with `_type: "data_lineage"`)**
   - Audit trail of datasets, joins, filters, and grain
   - Always present for data queries
   - See below for schema

4. **Caveats (type: "text", markdown with "⚠️" prefix)**
   - Verification warnings if data quality issues detected
   - Only present if Verifier flagged issues
   - Example: "⚠️ Note: Some join ratios exceed expected thresholds"

**Data Lineage Schema:**

```typescript
{
  _type: 'data_lineage',
  datasets: [
    { name: string, source: string }  // Datasets accessed
  ],
  joins: [
    {
      left: string,      // Left dataset name
      right: string,     // Right dataset name
      on: string[]       // Join keys
    }
  ],
  filters: [
    {
      field: string,
      operator: string,  // '=', '>', '<', '>=', '<=', 'LIKE', 'IN', etc.
      value: any
    }
  ],
  timeWindow?: {
    start: string,      // ISO 8601 date
    end: string
  },
  grain: string         // Aggregation level (e.g., 'region', 'day', 'customer')
}
```

**Error Response:**

If the agent encounters an error or cannot answer:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "I cannot answer this question because the required data is not available in the ontology.\n\n**Missing datasets:**\n- product_inventory\n- warehouse_locations\n\n**Available datasets:**\n- orders\n- customers\n- products"
      }
    ],
    "isError": false
  }
}
```

**Performance Characteristics:**

- **Simple queries** (single dataset, no joins): 5-15 seconds
- **Complex analytical queries** (multiple datasets, joins, verification): 30-60 seconds
- **Maximum execution time**: 5 minutes (hard timeout)

**Permissions Required:**

- `data_agent:read` — Access to MCP endpoint
- `data_agent:write` — Execute ask_question tool
- `ontologies:read` — Read ontology data

**Model Selection:**

The agent uses the user's `defaultProvider` setting from UserSettings. Clients cannot override the model selection.

---

## Chart Data Format

The `ask_question` tool may return one or more ChartSpec objects as part of its response. These objects provide structured data for rendering visualizations.

### ChartSpec Schema

```typescript
interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories?: string[];      // For bar/line charts (x-axis labels)
  series?: SeriesData[];      // For bar/line charts (multiple data series)
  slices?: SliceData[];       // For pie charts
  points?: PointData[];       // For scatter plots
  layout?: 'vertical' | 'horizontal';  // For bar charts
}

interface SeriesData {
  label: string;              // Series name (e.g., "Q4 2025")
  data: number[];             // Values corresponding to categories
}

interface SliceData {
  label: string;              // Slice name (e.g., "West")
  value: number;              // Slice value
}

interface PointData {
  x: number;
  y: number;
  label?: string;             // Optional point label
}
```

### Chart Type: Bar

**Use Case:** Compare values across categories

**Example:**

```json
{
  "type": "bar",
  "title": "Sales by Region",
  "xAxisLabel": "Region",
  "yAxisLabel": "Total Sales ($)",
  "categories": ["West", "East", "South", "North"],
  "series": [
    {
      "label": "Q4 2025",
      "data": [1800000, 1200000, 800000, 400000]
    }
  ],
  "layout": "vertical"
}
```

**Rendering Guidance:**

- `categories[i]` corresponds to `series[0].data[i]`
- Multiple series for grouped bar charts
- `layout: 'horizontal'` for horizontal bars

### Chart Type: Line

**Use Case:** Show trends over time

**Example:**

```json
{
  "type": "line",
  "title": "Monthly Sales Trend",
  "xAxisLabel": "Month",
  "yAxisLabel": "Sales ($)",
  "categories": ["Jan", "Feb", "Mar", "Apr"],
  "series": [
    {
      "label": "2025",
      "data": [100000, 120000, 115000, 140000]
    },
    {
      "label": "2024",
      "data": [95000, 110000, 105000, 125000]
    }
  ]
}
```

**Rendering Guidance:**

- Connect points with lines
- Multiple series for comparison
- Consider adding markers for data points

### Chart Type: Pie

**Use Case:** Show composition or parts of a whole

**Example:**

```json
{
  "type": "pie",
  "title": "Sales Distribution by Product Category",
  "slices": [
    { "label": "Electronics", "value": 450000 },
    { "label": "Clothing", "value": 320000 },
    { "label": "Home & Garden", "value": 180000 },
    { "label": "Books", "value": 50000 }
  ]
}
```

**Rendering Guidance:**

- Calculate percentages: `value / sum(all values)`
- Sort slices by value (descending) for readability
- Limit to 6-8 slices; group smaller slices as "Other"

### Chart Type: Scatter

**Use Case:** Show correlation between two variables

**Example:**

```json
{
  "type": "scatter",
  "title": "Customer Lifetime Value vs. Order Frequency",
  "xAxisLabel": "Number of Orders",
  "yAxisLabel": "Lifetime Value ($)",
  "points": [
    { "x": 5, "y": 2500, "label": "Customer A" },
    { "x": 12, "y": 8400, "label": "Customer B" },
    { "x": 3, "y": 1200, "label": "Customer C" }
  ]
}
```

**Rendering Guidance:**

- Plot points on X-Y plane
- Optional labels for outliers or notable points
- Consider adding trend line if correlation is strong

### Multiple Charts

The agent may return multiple charts in a single response:

```json
{
  "_type": "chart_specs",
  "charts": [
    { "type": "bar", "title": "Sales by Region", ... },
    { "type": "line", "title": "Monthly Trend", ... }
  ]
}
```

**Rendering Guidance:**

- Display charts in order
- Use consistent styling across charts
- Consider pagination or collapsible sections for many charts

### No Charts

If no chart data is provided, the agent determined that a visualization would not add value. Render only the narrative text.

---

## Clarification Flow

When the Planner phase detects critical ambiguities in a question, it may request clarification from the user before executing the expensive analytical pipeline.

### Detection

The Planner decides whether to request clarification based on:

- **Ambiguous time references** — "last quarter" when fiscal year is unknown
- **Vague qualifiers** — "high-value customers" without threshold
- **Multiple interpretations** — "revenue" could be gross or net
- **Missing context** — User preferences not set (e.g., preferred region)

**Planner Output with Clarification:**

```json
{
  "shouldClarify": true,
  "clarificationQuestions": [
    {
      "question": "What time period should I analyze?",
      "suggestions": ["Last 30 days", "Current quarter", "Year to date"]
    },
    {
      "question": "How do you define 'high-value' customers?",
      "suggestions": ["Lifetime value > $10,000", "Average order > $1,000"]
    }
  ]
}
```

**Maximum:** 3 clarification questions per query.

### MCP Response

When clarification is needed, the `ask_question` tool returns immediately with a structured response:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"_type\":\"clarification_request\",\"questions\":[{\"question\":\"What time period should I analyze?\",\"suggestions\":[\"Last 30 days\",\"Current quarter\",\"Year to date\"]},{\"question\":\"How do you define 'high-value' customers?\",\"suggestions\":[\"Lifetime value > $10,000\",\"Average order > $1,000\"]}]}"
      }
    ],
    "isError": false
  }
}
```

**Parsed JSON:**

```json
{
  "_type": "clarification_request",
  "questions": [
    {
      "question": "What time period should I analyze?",
      "suggestions": ["Last 30 days", "Current quarter", "Year to date"]
    },
    {
      "question": "How do you define 'high-value' customers?",
      "suggestions": ["Lifetime value > $10,000", "Average order > $1,000"]
    }
  ]
}
```

### Client Handling

**Option 1: Answer Questions**

The client should prompt the user for answers and send a new `ask_question` request with the original question plus context:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "ask_question",
    "arguments": {
      "ontologyId": "uuid-1",
      "question": "Show high-value customer trends. [Time period: Current quarter] [High-value threshold: Lifetime value > $10,000]"
    }
  }
}
```

**Option 2: Proceed with Assumptions**

The client can instruct the user to proceed anyway. The agent will make reasonable assumptions and note them in the response.

**Option 3: Save as Preferences**

The client can save the user's answers as preferences for future queries (see User Preferences below).

### User Preferences

Clients can reduce clarification requests by setting user preferences via the User Settings API:

**Set Default Time Period:**

```http
PATCH /api/user-settings HTTP/1.1
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "dataAgent": {
    "defaultTimePeriod": "current_quarter",
    "highValueThreshold": 10000
  }
}
```

The agent will read these preferences from UserSettings and use them when ambiguities arise, reducing the need for clarification.

---

## Session Management

The MCP server uses session-based architecture to maintain per-client server instances with captured user permissions.

### Session Lifecycle

1. **Session Creation** — First POST to `/api/data-agent/mcp` creates a new session
2. **Session Storage** — Server instance stored in-memory with session ID
3. **Session Reuse** — Subsequent requests with same `mcp-session-id` reuse the session
4. **Session Termination** — DELETE request or timeout destroys the session

### Session Identification

The client includes a session ID in the `mcp-session-id` header:

```http
POST /api/data-agent/mcp HTTP/1.1
Authorization: Bearer <jwt>
mcp-session-id: client-generated-session-id
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list"
}
```

**If session doesn't exist:** Server creates a new MCP server instance and stores it with the session ID.

**If session exists:** Server retrieves the existing instance and routes the request to it.

### Permission Capture

User permissions are captured at session creation time from the JWT:

```typescript
// Extract permissions from JWT
const userPermissions = jwtPayload.permissions; // ['data_agent:read', 'ontologies:read', 'data_agent:write']

// Create MCP server with captured permissions
const server = mcpServerFactory.createServer(userId, userPermissions);

// Store session
sessionStore.set(sessionId, { server, userId, permissions: userPermissions });
```

**Important:** Permissions are **frozen** at session creation. If the user's roles change mid-session, they must create a new session (or the client should refresh after token expiry).

### Session Storage

Sessions are stored in-memory (Map):

```typescript
private sessions = new Map<string, {
  server: Server;
  userId: string;
  permissions: string[];
  createdAt: Date;
}>();
```

**Production Note:** For multi-instance deployments, use Redis or another shared session store.

### Session Cleanup

**Manual Termination:**

```http
DELETE /api/data-agent/mcp HTTP/1.1
Authorization: Bearer <jwt>
mcp-session-id: client-generated-session-id
```

**Auto-Expiry:**

Sessions automatically expire after 1 hour of inactivity. A background cleanup job runs every 15 minutes to remove stale sessions.

**Token Expiry:**

When the JWT expires (15 minutes), the client must refresh the token. The session remains valid, but subsequent requests need the new token.

### Error Handling

**Session Not Found (Client Sends Bad Session ID):**

The server creates a new session with the provided ID. This is transparent to the client.

**Concurrent Requests:**

MCP protocol is designed for sequential request-response. If a client sends concurrent requests with the same session ID, behavior is undefined (likely causes message ID conflicts).

---

## RBAC & Permissions

The MCP server enforces role-based access control aligned with Knecta's existing RBAC model.

### Required Permissions

**To Access MCP Endpoint:**

- `data_agent:read` — Access to `/api/data-agent/mcp`
- `ontologies:read` — Read ontology resources

**To Execute ask_question Tool:**

- `data_agent:write` — Execute queries

### Permission Mapping by Role

| Role | data_agent:read | ontologies:read | data_agent:write | MCP Access |
|------|----------------|-----------------|------------------|------------|
| **Admin** | ✅ | ✅ | ✅ | Full (browse + query) |
| **Contributor** | ✅ | ✅ | ✅ | Full (browse + query) |
| **Viewer** | ✅ | ✅ | ❌ | Read-only (browse only, cannot query) |

### Resource Access Control

**List Ontologies (`knecta://ontologies`):**

- Requires: `ontologies:read`
- Returns: Only ontologies in `ready` status
- Filtering: None (all ready ontologies visible to all authenticated users)

**Ontology Details (`knecta://ontologies/{id}`):**

- Requires: `ontologies:read`
- Returns: 404 if ontology not found or not ready
- No per-ontology ACL (future enhancement)

**Dataset Schema (`knecta://ontologies/{id}/datasets/{name}`):**

- Requires: `ontologies:read`
- Returns: 404 if ontology or dataset not found

### Tool Access Control

**ask_question:**

- Requires: `data_agent:write` + `ontologies:read`
- Viewer role: Returns `403 Forbidden`
- Error response:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "error": {
    "code": -32001,
    "message": "Insufficient permissions to execute this tool",
    "data": {
      "required": ["data_agent:write"],
      "missing": ["data_agent:write"]
    }
  }
}
```

### Permission Enforcement Flow

1. **McpAuthGuard** validates Bearer JWT
2. **Guard extracts permissions** from JWT payload
3. **Guard checks required permissions** (`data_agent:read`, `ontologies:read`)
4. **If insufficient:** Returns 401 with `WWW-Authenticate` header
5. **If sufficient:** Captures permissions in session
6. **Tool execution:** Server checks `data_agent:write` before calling ask_question

### Audit Logging

All MCP requests are logged to `audit_events`:

```typescript
{
  userId: string,
  action: 'mcp.resource.read' | 'mcp.tool.call',
  resourceType: 'mcp_resource' | 'mcp_tool',
  resourceId: string,  // URI or tool name
  metadata: {
    sessionId: string,
    clientName: string,
    clientVersion: string
  }
}
```

---

## Error Handling

The MCP server returns errors in MCP JSON-RPC format with Knecta-specific error codes.

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Human-readable error message",
    "data": {
      "detail": "Additional context",
      "knecta_code": "KNECTA_ERROR_CODE"
    }
  }
}
```

### Error Codes

| Code | MCP Standard | Knecta Meaning |
|------|--------------|----------------|
| `-32700` | Parse error | Invalid JSON in request body |
| `-32600` | Invalid request | Malformed JSON-RPC request |
| `-32601` | Method not found | Unknown MCP method |
| `-32602` | Invalid params | Missing or invalid parameters |
| `-32603` | Internal error | Server-side error |
| `-32001` | Custom | Insufficient permissions |
| `-32002` | Custom | Resource not found |
| `-32003` | Custom | Ontology not ready |
| `-32004` | Custom | Agent execution timeout |
| `-32005` | Custom | Database connection error |

### Common Errors

#### 1. Unauthorized (401)

**Cause:** No Bearer token or invalid token

**HTTP Response:**

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://knecta.example.com/.well-known/oauth-protected-resource/api/data-agent/mcp"
Content-Type: application/json

{
  "error": "unauthorized",
  "message": "No authorization token provided"
}
```

**Client Action:** Initiate OAuth 2.1 flow

#### 2. Forbidden (403)

**Cause:** Token valid but insufficient permissions

**MCP Error:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Insufficient permissions",
    "data": {
      "required": ["data_agent:write"],
      "missing": ["data_agent:write"],
      "knecta_code": "FORBIDDEN"
    }
  }
}
```

**Client Action:** Inform user they don't have access to this resource/tool

#### 3. Ontology Not Found (404)

**Cause:** Invalid ontology ID or ontology not ready

**MCP Error:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32002,
    "message": "Ontology not found or not ready",
    "data": {
      "ontologyId": "uuid-invalid",
      "knecta_code": "ONTOLOGY_NOT_FOUND"
    }
  }
}
```

**Client Action:** List available ontologies and prompt user to select a valid one

#### 4. Dataset Not Found

**Cause:** Dataset name doesn't exist in ontology

**MCP Error:**

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32002,
    "message": "Dataset not found in ontology",
    "data": {
      "datasetName": "nonexistent_table",
      "ontologyId": "uuid-1",
      "knecta_code": "DATASET_NOT_FOUND"
    }
  }
}
```

**Client Action:** Fetch ontology details to see available datasets

#### 5. Agent Execution Timeout

**Cause:** Query took longer than 5 minutes

**MCP Error:**

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "error": {
    "code": -32004,
    "message": "Agent execution timeout after 300 seconds",
    "data": {
      "question": "Complex question...",
      "knecta_code": "AGENT_TIMEOUT"
    }
  }
}
```

**Client Action:** Suggest user simplify the question or break it into smaller parts

#### 6. Database Connection Error

**Cause:** Cannot connect to user's database

**MCP Error:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "error": {
    "code": -32005,
    "message": "Failed to connect to database",
    "data": {
      "detail": "Connection refused",
      "knecta_code": "DATABASE_CONNECTION_ERROR"
    }
  }
}
```

**Client Action:** Inform user their database connection is down

#### 7. Invalid Question

**Cause:** Question too short, too long, or empty

**MCP Error:**

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "detail": "Question must be between 1 and 2000 characters",
      "knecta_code": "VALIDATION_ERROR"
    }
  }
}
```

**Client Action:** Validate input before sending

### Troubleshooting Guide

**Problem:** Client can't connect to MCP endpoint

**Checklist:**
1. Verify HTTPS is enabled (OAuth 2.1 requirement)
2. Check Nginx is proxying `/.well-known/` correctly
3. Verify API server is running and healthy (`GET /api/health/live`)
4. Check firewall allows connections to port 8319 (or your configured port)

**Problem:** OAuth flow fails at authorization step

**Checklist:**
1. Verify user is logged in to Knecta (Google OAuth)
2. Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
3. Verify redirect_uri matches client configuration
4. Check PKCE code_challenge is correctly generated (SHA256, base64url)

**Problem:** "Ontology not found" error

**Checklist:**
1. List ontologies with `knecta://ontologies` to verify ID
2. Check ontology status is `ready` (not `creating`, `failed`)
3. Verify user has `ontologies:read` permission
4. Confirm ontology wasn't deleted

**Problem:** ask_question returns "cannot answer"

**Checklist:**
1. Check if required datasets exist in the ontology
2. Verify question is clear and unambiguous
3. Review Navigator phase output (if available) for missing relationships
4. Try listing datasets with `knecta://ontologies/{id}` to see what's available

**Problem:** Agent execution is slow

**Explanation:**
- Simple queries (1 dataset, no joins): 5-15s
- Complex queries (multiple datasets, joins, verification): 30-60s
- First query in a session is slower due to model loading

**Optimization:**
- Use clarification to narrow scope
- Set user preferences to reduce ambiguity detection
- Break complex questions into smaller parts

---

## Testing with MCP Inspector

The MCP Inspector is a development tool for testing MCP servers locally.

### Installation

```bash
npm install -g @modelcontextprotocol/inspector
```

### Start Knecta API

```bash
cd infra/compose
docker compose -f base.compose.yml -f dev.compose.yml up
```

### Run Inspector

```bash
mcp-inspector https://localhost:8319/api/data-agent/mcp
```

**Note:** Use `https://` (not `http://`) if your local setup uses SSL.

### Inspector UI

The Inspector opens in your browser at `http://localhost:5173` (default).

**Step 1: Authentication**

Click "Authenticate" button. The Inspector will:
1. Fetch `/.well-known/oauth-protected-resource/api/data-agent/mcp`
2. Fetch `/.well-known/oauth-authorization-server`
3. Open authorization endpoint in popup
4. You login via Google OAuth (if not already logged in)
5. You authorize the Inspector client
6. Inspector receives access token and stores it

**Step 2: List Resources**

Click "Resources" tab, then "List Resources". You should see:

```json
{
  "resources": [
    {
      "uri": "knecta://ontologies",
      "name": "Available Ontologies",
      "description": "List all ready ontologies",
      "mimeType": "application/json"
    }
  ]
}
```

**Step 3: Read a Resource**

Click "Read Resource" for `knecta://ontologies`. You'll see the JSON array of ontologies.

**Step 4: Call ask_question Tool**

1. Click "Tools" tab
2. Select `ask_question`
3. Enter parameters:
   - `ontologyId`: (UUID from resources list)
   - `question`: "What were total sales last month?"
4. Click "Call Tool"
5. Observe the multi-content response with narrative, charts, and lineage

### Debugging with Inspector

**Enable Verbose Logging:**

Set environment variable before starting Inspector:

```bash
DEBUG=mcp:* mcp-inspector https://localhost:8319/api/data-agent/mcp
```

**View Network Traffic:**

Open browser DevTools (F12) → Network tab to see MCP JSON-RPC requests/responses.

**Test Token Expiry:**

1. Connect to Inspector
2. Wait 15 minutes (or set `JWT_ACCESS_TTL_MINUTES=1` for faster testing)
3. Try calling a tool
4. Should get 401 Unauthorized
5. Click "Re-authenticate" to refresh token

**Test Permission Denied:**

1. Create a user with Viewer role
2. Login as that user
3. Try calling `ask_question` tool
4. Should get 403 Forbidden error with missing permission `data_agent:write`

---

## API Endpoints

The MCP server exposes several HTTP endpoints for OAuth and MCP protocol.

### OAuth Endpoints

#### GET /api/oauth/authorize

**Description:** Initiate authorization code flow

**Parameters:**

- `response_type` (required) — Must be `code`
- `client_id` (required) — Client identifier
- `redirect_uri` (required) — Callback URL
- `scope` (optional) — Space-separated scopes (default: `data_agent:read data_agent:write ontologies:read`)
- `state` (required) — CSRF token
- `code_challenge` (required) — PKCE challenge (base64url-encoded SHA256)
- `code_challenge_method` (required) — Must be `S256`

**Success Response (302):**

```
Location: {redirect_uri}?code={authorization_code}&state={state}
```

**Error Response (401 if not logged in):**

```json
{
  "error": "login_required",
  "login_url": "https://knecta.example.com/api/auth/google",
  "message": "User must login before authorizing application"
}
```

**Error Response (400 if invalid params):**

```json
{
  "error": "invalid_request",
  "error_description": "Missing required parameter: code_challenge"
}
```

---

#### POST /api/oauth/token

**Description:** Exchange authorization code for tokens or refresh access token

**Content-Type:** `application/x-www-form-urlencoded`

**Grant Type: authorization_code**

**Parameters:**

- `grant_type` (required) — `authorization_code`
- `code` (required) — Authorization code from `/authorize`
- `redirect_uri` (required) — Must match original request
- `client_id` (required) — Client identifier
- `code_verifier` (required) — PKCE verifier (plain text)

**Success Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "refresh_abc123xyz",
  "scope": "data_agent:read data_agent:write ontologies:read"
}
```

**Grant Type: refresh_token**

**Parameters:**

- `grant_type` (required) — `refresh_token`
- `refresh_token` (required) — Refresh token from previous response
- `client_id` (required) — Client identifier

**Success Response:** (same as authorization_code)

**Error Response (400):**

```json
{
  "error": "invalid_grant",
  "error_description": "Invalid or expired authorization code"
}
```

---

#### GET /api/oauth/.well-known/protected-resource

**Description:** Protected resource metadata (RFC 9470)

**Response:**

```json
{
  "resource": "https://knecta.example.com/api/data-agent/mcp",
  "authorization_servers": ["https://knecta.example.com"],
  "scopes_supported": [
    "data_agent:read",
    "data_agent:write",
    "ontologies:read"
  ],
  "bearer_methods_supported": ["header"]
}
```

---

#### GET /api/oauth/.well-known/oauth-authorization-server

**Description:** Authorization server metadata (RFC 8414)

**Response:**

```json
{
  "issuer": "https://knecta.example.com",
  "authorization_endpoint": "https://knecta.example.com/api/oauth/authorize",
  "token_endpoint": "https://knecta.example.com/api/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": [
    "data_agent:read",
    "data_agent:write",
    "ontologies:read"
  ],
  "token_endpoint_auth_methods_supported": ["none"],
  "client_id_metadata_document_supported": true
}
```

---

### MCP Endpoints

#### POST /api/data-agent/mcp

**Description:** Send MCP request (create session or send message)

**Headers:**

- `Authorization: Bearer {jwt}` (required)
- `mcp-session-id: {session_id}` (optional, auto-generated if omitted)
- `Content-Type: application/json`

**Body:** MCP JSON-RPC request

**Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list"
}
```

**Response:** MCP JSON-RPC response (see Resources and Tools sections)

---

#### GET /api/data-agent/mcp

**Description:** Read pending MCP messages (for streamable HTTP transport)

**Headers:**

- `Authorization: Bearer {jwt}` (required)
- `mcp-session-id: {session_id}` (required)

**Response:** Server-Sent Events stream

**Example:**

```
data: {"jsonrpc":"2.0","id":1,"result":{"resources":[...]}}

data: {"jsonrpc":"2.0","id":2,"result":{"content":[...]}}
```

---

#### DELETE /api/data-agent/mcp

**Description:** Terminate MCP session

**Headers:**

- `Authorization: Bearer {jwt}` (required)
- `mcp-session-id: {session_id}` (required)

**Response:**

```json
{
  "message": "Session terminated"
}
```

---

## Security

The MCP server implements multiple security layers to protect user data and prevent abuse.

### Transport Security

- **HTTPS Required** — OAuth 2.1 mandates HTTPS for authorization flows
- **TLS 1.2+** — Minimum supported version
- **HSTS Header** — Enforces HTTPS on clients

### Authentication Security

- **OAuth 2.1** — Modern standard with PKCE required for all clients
- **No Client Secrets** — Public clients use PKCE instead of static secrets
- **Short-lived Access Tokens** — 15 minutes (configurable)
- **Refresh Token Rotation** — New refresh token issued with each refresh
- **Authorization Code Single-Use** — Codes invalidated after first use
- **Code Expiry** — Authorization codes expire after 10 minutes

### Session Security

- **Session Isolation** — Each MCP client gets an isolated server instance
- **Permission Capture** — User permissions frozen at session creation
- **Session Expiry** — Auto-cleanup after 1 hour of inactivity
- **No Shared State** — Sessions cannot access each other's data

### Input Validation

- **Zod Schemas** — All MCP requests validated against schemas
- **Question Length Limits** — 1-2000 characters
- **UUID Validation** — Ontology IDs must be valid UUIDs
- **SQL Injection Prevention** — Parameterized queries only, no string concatenation

### Rate Limiting

**Recommendation:** Implement rate limiting at Nginx level:

```nginx
limit_req_zone $binary_remote_addr zone=mcp:10m rate=10r/s;

location /api/data-agent/mcp {
    limit_req zone=mcp burst=20 nodelay;
    # ... rest of config
}
```

**Suggested Limits:**

- **ask_question tool:** 5 requests/minute per user
- **Resources:** 30 requests/minute per user
- **OAuth authorize:** 10 requests/minute per IP

### Audit Logging

All MCP activity is logged to `audit_events`:

```sql
INSERT INTO audit_events (
  user_id,
  action,
  resource_type,
  resource_id,
  metadata
) VALUES (
  'user-uuid',
  'mcp.tool.call',
  'mcp_tool',
  'ask_question',
  '{"sessionId": "...", "ontologyId": "...", "question": "..."}'
);
```

**Logged Events:**

- `mcp.session.created` — New session created
- `mcp.session.terminated` — Session ended
- `mcp.resource.read` — Resource accessed
- `mcp.tool.call` — Tool executed

### Data Access Control

- **Row-Level Security** — Future enhancement (per-ontology ACL)
- **Read-Only Queries** — Agent cannot INSERT, UPDATE, DELETE
- **Query Timeout** — 30 seconds per SQL query
- **Result Size Limit** — 10,000 rows max per query

### Secrets Management

- **JWT Secret** — 32+ character random string, stored in environment variable
- **OAuth Codes** — Cryptographically random, single-use
- **Session IDs** — Client-generated (no server-side secret material)

---

## Configuration

The MCP server is configured via environment variables in `infra/compose/.env`.

### Required Environment Variables

```bash
# OAuth 2.1
OAUTH_AUTHORIZATION_CODE_TTL_MINUTES=10
OAUTH_DEVICE_CODE_TTL_MINUTES=15

# JWT (shared with existing auth)
JWT_SECRET=your-secret-key-min-32-chars-CHANGE-THIS
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=14

# Application URL (for OAuth metadata)
APP_URL=https://knecta.example.com

# Database (for audit logging)
DATABASE_URL=postgresql://user:password@localhost:5432/knecta
```

### Optional Environment Variables

```bash
# MCP Session Configuration
MCP_SESSION_TTL_MINUTES=60              # Session expiry (default: 60)
MCP_SESSION_CLEANUP_INTERVAL_MINUTES=15 # Cleanup job interval (default: 15)

# Rate Limiting (if implemented)
MCP_RATE_LIMIT_WINDOW_MS=60000          # Rate limit window (default: 1 minute)
MCP_RATE_LIMIT_MAX_REQUESTS=5           # Max ask_question calls per window (default: 5)
```

### Runtime Configuration

**Session TTL:**

```typescript
@Injectable()
export class McpController {
  private readonly sessionTTL = parseInt(
    process.env.MCP_SESSION_TTL_MINUTES || '60'
  ) * 60 * 1000; // Convert to milliseconds
}
```

**OAuth Code Expiry:**

```typescript
@Injectable()
export class OauthService {
  private readonly codeExpiryMinutes = parseInt(
    process.env.OAUTH_AUTHORIZATION_CODE_TTL_MINUTES || '10'
  );
}
```

### Production Recommendations

**Security:**

- Use strong `JWT_SECRET` (64+ characters, cryptographically random)
- Enable HTTPS only (no HTTP fallback)
- Set `NODE_ENV=production`
- Implement rate limiting

**Performance:**

- Use Redis for session storage (replace in-memory Map)
- Enable connection pooling for database queries
- Set `MCP_SESSION_TTL_MINUTES=30` for shorter sessions

**Observability:**

- Enable structured logging with Pino
- Export metrics to Prometheus
- Set up Uptrace for distributed tracing

---

## File Inventory

All MCP-related code is located in the API application.

### Backend Files

**Module Root:**
- `apps/api/src/mcp/mcp.module.ts` — MCP module definition

**OAuth Authorization Server:**
- `apps/api/src/oauth/oauth.module.ts` — OAuth module
- `apps/api/src/oauth/oauth.service.ts` — Code generation, token minting
- `apps/api/src/oauth/oauth.controller.ts` — `/authorize`, `/token`, `/.well-known`
- `apps/api/src/oauth/dto/authorize.dto.ts` — Authorization request validation
- `apps/api/src/oauth/dto/token.dto.ts` — Token request validation

**MCP Server:**
- `apps/api/src/mcp/mcp.controller.ts` — HTTP transport controller
- `apps/api/src/mcp/mcp-server.service.ts` — Server factory with resources + tool
- `apps/api/src/mcp/mcp-auth.guard.ts` — Bearer JWT validation guard
- `apps/api/src/mcp/dto/mcp-request.dto.ts` — JSON-RPC request validation

**Database:**
- `apps/api/prisma/schema.prisma` — `authorization_codes` table schema
- `apps/api/prisma/migrations/` — Migration files for OAuth tables

### Configuration Files

- `infra/compose/.env.example` — Environment variable template
- `infra/nginx/nginx.conf` — Nginx proxy configuration for `/.well-known/` and `/api/data-agent/mcp`

### Tests

- `apps/api/src/oauth/oauth.service.spec.ts` — OAuth service unit tests
- `apps/api/src/oauth/oauth.controller.spec.ts` — OAuth controller integration tests
- `apps/api/src/mcp/mcp.controller.spec.ts` — MCP controller tests
- `apps/api/src/mcp/mcp-server.service.spec.ts` — MCP server factory tests

---

## Testing

The MCP feature includes comprehensive test coverage for OAuth, MCP server, and integration flows.

### Test Structure

```
apps/api/src/
  oauth/
    __tests__/
      oauth.service.spec.ts         # OAuth service unit tests
      oauth.controller.spec.ts      # OAuth endpoints integration tests
  mcp/
    __tests__/
      mcp.controller.spec.ts        # MCP transport tests
      mcp-server.service.spec.ts    # Server factory tests
      mcp-auth.guard.spec.ts        # Auth guard tests
```

### Running Tests

**All MCP Tests:**

```bash
cd apps/api
npm test -- mcp
```

**OAuth Tests:**

```bash
cd apps/api
npm test -- oauth
```

**Single Test File:**

```bash
cd apps/api
npm test -- oauth.service.spec.ts
```

**Watch Mode:**

```bash
cd apps/api
npm test -- --watch mcp
```

### Test Coverage

**OAuth Service (oauth.service.spec.ts):**

- ✅ Generate authorization code with PKCE
- ✅ Validate authorization code
- ✅ Reject expired authorization code
- ✅ Reject mismatched code_verifier
- ✅ Exchange code for access + refresh tokens
- ✅ Refresh access token with rotation
- ✅ Reject invalid refresh token

**OAuth Controller (oauth.controller.spec.ts):**

- ✅ GET /authorize returns 401 if not logged in
- ✅ GET /authorize redirects with code if logged in
- ✅ GET /authorize validates PKCE parameters
- ✅ POST /token exchanges code for tokens
- ✅ POST /token refreshes tokens
- ✅ GET /.well-known/protected-resource returns metadata
- ✅ GET /.well-known/oauth-authorization-server returns metadata

**MCP Controller (mcp.controller.spec.ts):**

- ✅ POST /mcp creates session on first request
- ✅ POST /mcp reuses existing session
- ✅ POST /mcp returns 401 without Bearer token
- ✅ POST /mcp returns 403 if insufficient permissions
- ✅ DELETE /mcp terminates session
- ✅ GET /mcp streams pending messages

**MCP Server Service (mcp-server.service.spec.ts):**

- ✅ createServer returns MCP Server instance
- ✅ Server exposes 3 resources (ontologies, details, dataset)
- ✅ Server exposes 1 tool (ask_question)
- ✅ ask_question requires ontologyId + question
- ✅ ask_question delegates to DataAgentAgentService

**MCP Auth Guard (mcp-auth.guard.spec.ts):**

- ✅ Allows request with valid JWT and required permissions
- ✅ Blocks request without Authorization header
- ✅ Blocks request with invalid JWT
- ✅ Blocks request with missing permissions
- ✅ Sets WWW-Authenticate header on 401

### Integration Tests

**Manual OAuth Flow Test:**

1. Start API server
2. Open browser to `https://localhost:8319/api/oauth/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&state=abc&code_challenge=xyz&code_challenge_method=S256`
3. If not logged in, redirected to Google OAuth
4. After login, redirected to callback with `?code=...&state=abc`
5. Exchange code: `POST /api/oauth/token` with `grant_type=authorization_code&code=...&code_verifier=...`
6. Receive access_token

**Manual MCP Test:**

1. Use MCP Inspector (see [Testing with MCP Inspector](#testing-with-mcp-inspector))
2. Verify resources list
3. Verify ask_question tool execution
4. Verify 401 on expired token

---

## Packages

The MCP feature adds these npm dependencies:

### Backend Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.0.4"
}
```

**@modelcontextprotocol/sdk** — Official MCP SDK
- Server class for implementing MCP servers
- Streamable HTTP transport for SSE-based communication
- Request/response types and validation

### No Additional Frontend Dependencies

The MCP server is backend-only. Frontend continues to use the existing Data Agent UI via REST API.

---

## Appendix: Example Client Implementation

This appendix provides a reference implementation for connecting to the Knecta MCP server from a custom client.

### TypeScript Client (Node.js)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPTransport } from '@modelcontextprotocol/sdk/client/transports.js';
import crypto from 'crypto';
import { parse } from 'querystring';

// OAuth 2.1 with PKCE
async function authenticateWithKnecta(
  serverUrl: string,
  clientId: string,
  redirectUri: string
): Promise<string> {
  // Step 1: Generate PKCE parameters
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  // Step 2: Build authorization URL
  const authUrl = new URL(`${serverUrl}/api/oauth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'data_agent:read data_agent:write ontologies:read');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('Open this URL in your browser:');
  console.log(authUrl.toString());
  console.log('\nWaiting for callback...');

  // Step 3: Start local server to receive callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = require('http').createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:3000`);
      const params = Object.fromEntries(url.searchParams);

      if (params.code && params.state === state) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Success! You can close this window.</h1>');
        server.close();
        resolve(params.code);
      } else {
        res.writeHead(400);
        res.end('Invalid callback');
        server.close();
        reject(new Error('Invalid callback'));
      }
    });
    server.listen(3000);
  });

  // Step 4: Exchange code for token
  const tokenResponse = await fetch(`${serverUrl}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Main function
async function main() {
  const serverUrl = 'https://knecta.example.com';
  const clientId = 'my-mcp-client';
  const redirectUri = 'http://localhost:3000/callback';

  // Authenticate
  const accessToken = await authenticateWithKnecta(serverUrl, clientId, redirectUri);
  console.log('Authenticated! Access token:', accessToken.substring(0, 20) + '...');

  // Create MCP client
  const transport = new StreamableHTTPTransport(
    new URL(`${serverUrl}/api/data-agent/mcp`),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const client = new Client(
    {
      name: 'my-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  await client.connect(transport);
  console.log('Connected to MCP server');

  // List resources
  const resources = await client.listResources();
  console.log('Resources:', JSON.stringify(resources, null, 2));

  // Read ontologies
  const ontologies = await client.readResource({
    uri: 'knecta://ontologies',
  });
  const ontologyList = JSON.parse(ontologies.contents[0].text);
  console.log('Ontologies:', ontologyList);

  // Ask a question
  if (ontologyList.length > 0) {
    const ontologyId = ontologyList[0].id;
    console.log(`\nAsking question to ontology ${ontologyId}...`);

    const result = await client.callTool({
      name: 'ask_question',
      arguments: {
        ontologyId,
        question: 'What were total sales last month?',
      },
    });

    console.log('\nAnswer:');
    result.content.forEach((block) => {
      if (block.type === 'text') {
        try {
          const parsed = JSON.parse(block.text);
          if (parsed._type === 'chart_specs') {
            console.log('Chart data:', JSON.stringify(parsed, null, 2));
          } else if (parsed._type === 'data_lineage') {
            console.log('Data lineage:', JSON.stringify(parsed, null, 2));
          } else {
            console.log(block.text);
          }
        } catch {
          // Plain text (narrative)
          console.log(block.text);
        }
      }
    });
  }

  // Close connection
  await client.close();
}

main().catch(console.error);
```

### Python Client (Conceptual)

```python
import requests
import hashlib
import base64
import secrets
from urllib.parse import urlencode, parse_qs

def authenticate_with_knecta(server_url, client_id, redirect_uri):
    # Generate PKCE parameters
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).decode('utf-8').rstrip('=')
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode('utf-8')).digest()
    ).decode('utf-8').rstrip('=')
    state = secrets.token_hex(16)

    # Build authorization URL
    auth_params = {
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'scope': 'data_agent:read data_agent:write ontologies:read',
        'state': state,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
    }
    auth_url = f"{server_url}/api/oauth/authorize?{urlencode(auth_params)}"

    print("Open this URL in your browser:")
    print(auth_url)

    # Manual step: user opens URL, authorizes, gets redirected to redirect_uri?code=...&state=...
    code = input("Enter the authorization code from the callback URL: ")

    # Exchange code for token
    token_response = requests.post(
        f"{server_url}/api/oauth/token",
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'client_id': client_id,
            'code_verifier': code_verifier,
        },
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    token_data = token_response.json()
    return token_data['access_token']

def main():
    server_url = 'https://knecta.example.com'
    client_id = 'my-mcp-client'
    redirect_uri = 'http://localhost:3000/callback'

    # Authenticate
    access_token = authenticate_with_knecta(server_url, client_id, redirect_uri)
    print(f"Authenticated! Access token: {access_token[:20]}...")

    # MCP requests (JSON-RPC over HTTP)
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }

    # List resources
    response = requests.post(
        f"{server_url}/api/data-agent/mcp",
        json={'jsonrpc': '2.0', 'id': 1, 'method': 'resources/list'},
        headers=headers,
    )
    print("Resources:", response.json())

    # Read ontologies
    response = requests.post(
        f"{server_url}/api/data-agent/mcp",
        json={
            'jsonrpc': '2.0',
            'id': 2,
            'method': 'resources/read',
            'params': {'uri': 'knecta://ontologies'},
        },
        headers=headers,
    )
    ontologies_text = response.json()['result']['contents'][0]['text']
    ontologies = eval(ontologies_text)  # Use json.loads in production
    print("Ontologies:", ontologies)

    # Ask a question
    if ontologies:
        ontology_id = ontologies[0]['id']
        response = requests.post(
            f"{server_url}/api/data-agent/mcp",
            json={
                'jsonrpc': '2.0',
                'id': 3,
                'method': 'tools/call',
                'params': {
                    'name': 'ask_question',
                    'arguments': {
                        'ontologyId': ontology_id,
                        'question': 'What were total sales last month?',
                    },
                },
            },
            headers=headers,
        )
        result = response.json()['result']
        for block in result['content']:
            print(block['text'])

if __name__ == '__main__':
    main()
```

---

**End of MCP Specification**
