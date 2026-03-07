-- CreateTable
CREATE TABLE "llm_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_config" TEXT NOT NULL,
    "last_tested_at" TIMESTAMPTZ,
    "last_test_result" BOOLEAN,
    "last_test_message" TEXT,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_providers_type_key" ON "llm_providers"("type");

-- CreateIndex
CREATE INDEX "llm_providers_enabled_idx" ON "llm_providers"("enabled");

-- AddForeignKey
ALTER TABLE "llm_providers" ADD CONSTRAINT "llm_providers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_providers" ADD CONSTRAINT "llm_providers_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData: Insert LLM provider permissions (idempotent)
INSERT INTO "permissions" ("id", "name", "description")
VALUES
    (gen_random_uuid(), 'llm_providers:read', 'View LLM provider configurations'),
    (gen_random_uuid(), 'llm_providers:write', 'Create, update, and manage LLM providers'),
    (gen_random_uuid(), 'llm_providers:delete', 'Delete LLM provider configurations')
ON CONFLICT ("name") DO NOTHING;

-- SeedData: Assign llm_providers:read, write, delete to admin
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r, "permissions" p
WHERE r."name" = 'admin'
  AND p."name" IN ('llm_providers:read', 'llm_providers:write', 'llm_providers:delete')
ON CONFLICT DO NOTHING;

-- SeedData: Assign llm_providers:read to contributor
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r, "permissions" p
WHERE r."name" = 'contributor'
  AND p."name" = 'llm_providers:read'
ON CONFLICT DO NOTHING;

-- SeedData: Assign llm_providers:read to viewer
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r, "permissions" p
WHERE r."name" = 'viewer'
  AND p."name" = 'llm_providers:read'
ON CONFLICT DO NOTHING;
