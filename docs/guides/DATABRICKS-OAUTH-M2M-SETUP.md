# Databricks OAuth Machine-to-Machine (M2M) Setup

This guide walks through creating a Databricks service principal, generating an OAuth secret, granting the necessary permissions, and configuring the connection in Knecta.

---

## Overview

Databricks recommends OAuth Machine-to-Machine (M2M) authentication for all programmatic access — replacing both Personal Access Tokens (PATs) and service account passwords.

OAuth M2M offers several advantages over PATs:

- **Short-lived tokens** — access tokens expire every hour and are automatically refreshed; no long-lived credentials to leak
- **Service principal isolation** — each application has its own identity with its own permissions, not tied to any human user's account
- **Fine-grained access control** — grant the service principal only the privileges it needs (specific warehouses, catalogs, schemas, tables)
- **Centrally managed secrets** — OAuth secrets can be rotated or revoked in the Databricks workspace without changing any user account
- **No MFA disruption** — OAuth M2M tokens are obtained programmatically without interactive prompts

For any connection from Knecta to Databricks, OAuth M2M is the recommended authentication method.

---

## Prerequisites

Before starting, ensure you have the following:

- A **Databricks workspace** on AWS, Azure, or GCP
- **Workspace admin** access (required to create service principals and manage OAuth secrets)
- A **SQL Warehouse** or cluster endpoint that the service principal will use
- For Azure Databricks: access to **Microsoft Entra ID** (Azure Active Directory)

---

## Step 1: Create a Service Principal

The process differs slightly depending on your Databricks platform.

### Azure Databricks

Azure Databricks service principals are backed by Microsoft Entra ID (formerly Azure AD) app registrations.

**Option A: Via Microsoft Entra ID**

1. Open the [Azure Portal](https://portal.azure.com) and navigate to **Microsoft Entra ID**.
2. Select **App registrations** from the left sidebar.
3. Click **New registration**.
4. Enter a name (e.g., `knecta-databricks-sp`) and click **Register**.
5. On the app overview page, copy the **Application (client) ID** — this is your OAuth Client ID.
6. In the Databricks workspace, go to **Admin Settings** → **Identity and Access** → **Service Principals**.
7. Click **Add service principal** and search for the app registration you just created.
8. Add the service principal to the workspace.

**Option B: Via Databricks Account Console**

1. Go to the [Databricks Account Console](https://accounts.azuredatabricks.net).
2. Navigate to **User Management** → **Service Principals** → **Add service principal**.
3. Enter a display name (e.g., `knecta-databricks-sp`).
4. Copy the **Application (client) ID** shown after creation.
5. The service principal is automatically available in all workspaces linked to the account. Add it to the specific workspace in **Admin Settings** → **Service Principals**.

### AWS Databricks

1. Go to the [Databricks Account Console](https://accounts.cloud.databricks.com).
2. Navigate to **User Management** → **Service Principals** → **Add service principal**.
3. Enter a display name (e.g., `knecta-databricks-sp`).
4. Copy the **Application (client) ID** shown after creation.
5. Navigate to your workspace and go to **Admin Settings** → **Identity and Access** → **Service Principals**.
6. Click **Add service principal** and select the principal you just created.

### GCP Databricks

1. Go to the [Databricks Account Console](https://accounts.gcp.databricks.com).
2. Navigate to **User Management** → **Service Principals** → **Add service principal**.
3. Enter a display name (e.g., `knecta-databricks-sp`).
4. Copy the **Application (client) ID** shown after creation.
5. Add it to the target workspace via **Admin Settings** → **Service Principals**.

---

## Step 2: Generate an OAuth Secret

This step is the same across all platforms.

1. In your **Databricks workspace**, go to **Admin Settings** → **Identity and Access** → **Service Principals**.
2. Click on the service principal you created in Step 1.
3. Select the **Secrets** tab.
4. Click **Generate secret**.
5. Copy the **Secret** value immediately — it is shown only once and cannot be retrieved again.

You now have two values to keep:
- **Client ID** — the Application (client) ID from Step 1
- **Client Secret** — the secret value from this step

Store both in a password manager or secrets vault.

---

## Step 3: Grant Permissions

The service principal needs access to the SQL Warehouse and to the data it will query.

### Grant warehouse access

1. In the workspace, go to **SQL Warehouses**.
2. Click on the warehouse Knecta will use.
3. Select the **Permissions** tab.
4. Click **Add permissions** and search for the service principal name.
5. Set the permission to **Can use** and click **Add**.

### Grant data access (Unity Catalog)

If your workspace uses Unity Catalog, grant the service principal the minimum required privileges:

```sql
-- Grant access to a catalog
GRANT USE CATALOG ON CATALOG my_catalog TO `<client-id>`;

-- Grant access to a schema
GRANT USE SCHEMA ON SCHEMA my_catalog.my_schema TO `<client-id>`;

-- Grant read access to specific tables
GRANT SELECT ON TABLE my_catalog.my_schema.my_table TO `<client-id>`;

-- Or grant read access to an entire schema
GRANT SELECT ON SCHEMA my_catalog.my_schema TO `<client-id>`;
```

Replace `<client-id>` with the Application (client) ID of the service principal (the format Databricks uses as the identity in SQL GRANT statements).

### Grant data access (Legacy Hive Metastore)

If your workspace does not use Unity Catalog:

```sql
-- Grant access to a database
GRANT USAGE ON DATABASE my_database TO `<service-principal-name>`;

-- Grant read access
GRANT SELECT ON DATABASE my_database TO `<service-principal-name>`;
```

---

## Step 4: Configure the Connection in Knecta

1. Navigate to **Connections** in the Knecta sidebar and click **Add Connection**.
2. Select **Databricks** as the database type.
3. Under **Authentication Method**, select **OAuth M2M (Recommended)**.
4. Fill in the connection fields:

   | Field | Value |
   |---|---|
   | Hostname | Your workspace hostname (e.g., `adb-1234567890123.12.azuredatabricks.net`) |
   | HTTP Path | The SQL Warehouse HTTP path (e.g., `/sql/1.0/warehouses/a1b2c3d4e5f6`) |
   | OAuth Client ID | The Application (client) ID from Step 1 |
   | Client Secret | The secret value from Step 2 |
   | Catalog | The default catalog (optional, Unity Catalog workspaces) |
   | Schema | The default schema (optional) |

   > **Finding the HTTP Path:** In the workspace, go to **SQL Warehouses** → click the warehouse → **Connection Details** tab. The HTTP Path is listed there.

   > **Finding the Hostname:** The workspace hostname is the domain portion of your Databricks workspace URL, without `https://` and without any trailing path.

5. Click **Test Connection** to verify the credentials are valid. A successful test confirms the service principal can authenticate and reach the warehouse.
6. Click **Save** to store the connection.

The Client Secret is encrypted at rest using AES-256-GCM before being stored in the database.

---

## Token Lifecycle

OAuth M2M tokens are managed automatically. You do not need to perform any manual token rotation.

- Knecta fetches a new access token from Databricks before each connection, using the Client ID and Client Secret.
- Databricks access tokens expire after **one hour**.
- The Client Secret itself does not expire unless you explicitly set an expiry when generating it or revoke it.

To rotate the OAuth secret (e.g., as part of a periodic security rotation):

1. Generate a new secret in **Admin Settings** → **Service Principals** → **Secrets** → **Generate secret**.
2. Update the connection in Knecta with the new Client Secret value.
3. Test and save the connection.
4. Revoke the old secret in Databricks.

---

## Troubleshooting

### "AADSTS7000215: Invalid client secret provided" (Azure)

- The Client Secret value was not copied correctly, or the wrong secret is being used.
- Check whether the secret has expired. In the Azure Portal, go to the app registration → **Certificates & secrets** and confirm the expiry date.
- Generate a new secret, update Knecta, and retry.

### "Invalid client credentials" (AWS/GCP)

- Verify the Client ID and Client Secret match the service principal and secret shown in the Databricks Account Console.
- Confirm the secret has not been revoked.

### "403 Forbidden" or "PERMISSION_DENIED" when running queries

- The service principal can authenticate but does not have access to the requested data.
- Check that the service principal has `CAN USE` permission on the warehouse (Step 3).
- Check that the service principal has `SELECT` permission on the catalog/schema/table (Step 3).
- If using Unity Catalog, confirm `USE CATALOG` and `USE SCHEMA` grants are in place — `SELECT` alone is not sufficient.

### "HTTP Path not found" or connection timeout

- Verify the HTTP Path is correct. Go to **SQL Warehouses** → **Connection Details** and copy the exact path.
- Confirm the warehouse is running. SQL Warehouses auto-suspend; the first connection after a period of inactivity may take up to 60 seconds while the warehouse resumes.

### "This service principal is not assigned to the workspace"

- The service principal was created at the account level but has not been added to the specific workspace.
- Go to **Admin Settings** → **Identity and Access** → **Service Principals** in the workspace and add the principal there.
