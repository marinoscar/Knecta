-- Migration: Rename owner_id to created_by_user_id and make nullable
-- This migration supports system-level resources by:
-- 1. Renaming owner_id → created_by_user_id (clearer semantics)
-- 2. Making the column nullable (allows system-owned resources)
-- 3. Changing ON DELETE CASCADE → ON DELETE SET NULL
--
-- Affected tables: data_connections, semantic_models, semantic_model_runs, ontologies
-- NOT affected: data_chats (keeps owner_id with CASCADE)

-- ====================================================================
-- TABLE: data_connections
-- ====================================================================

-- 1. Drop old FK constraint
ALTER TABLE "data_connections" DROP CONSTRAINT "data_connections_owner_id_fkey";

-- 2. Drop old index
DROP INDEX "data_connections_owner_id_idx";

-- 3. Rename column
ALTER TABLE "data_connections" RENAME COLUMN "owner_id" TO "created_by_user_id";

-- 4. Make column nullable
ALTER TABLE "data_connections" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- 5. Create new FK constraint with ON DELETE SET NULL
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Create new index
CREATE INDEX "data_connections_created_by_user_id_idx" ON "data_connections"("created_by_user_id");


-- ====================================================================
-- TABLE: semantic_models
-- ====================================================================

-- 1. Drop old FK constraint
ALTER TABLE "semantic_models" DROP CONSTRAINT "semantic_models_owner_id_fkey";

-- 2. Drop old index
DROP INDEX "semantic_models_owner_id_idx";

-- 3. Rename column
ALTER TABLE "semantic_models" RENAME COLUMN "owner_id" TO "created_by_user_id";

-- 4. Make column nullable
ALTER TABLE "semantic_models" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- 5. Create new FK constraint with ON DELETE SET NULL
ALTER TABLE "semantic_models" ADD CONSTRAINT "semantic_models_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Create new index
CREATE INDEX "semantic_models_created_by_user_id_idx" ON "semantic_models"("created_by_user_id");


-- ====================================================================
-- TABLE: semantic_model_runs
-- ====================================================================

-- 1. Drop old FK constraint
ALTER TABLE "semantic_model_runs" DROP CONSTRAINT "semantic_model_runs_owner_id_fkey";

-- 2. Drop old index
DROP INDEX "semantic_model_runs_owner_id_idx";

-- 3. Rename column
ALTER TABLE "semantic_model_runs" RENAME COLUMN "owner_id" TO "created_by_user_id";

-- 4. Make column nullable
ALTER TABLE "semantic_model_runs" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- 5. Create new FK constraint with ON DELETE SET NULL
ALTER TABLE "semantic_model_runs" ADD CONSTRAINT "semantic_model_runs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Create new index
CREATE INDEX "semantic_model_runs_created_by_user_id_idx" ON "semantic_model_runs"("created_by_user_id");


-- ====================================================================
-- TABLE: ontologies
-- ====================================================================

-- 1. Drop old FK constraint
ALTER TABLE "ontologies" DROP CONSTRAINT "ontologies_owner_id_fkey";

-- 2. Drop old index
DROP INDEX "ontologies_owner_id_idx";

-- 3. Rename column
ALTER TABLE "ontologies" RENAME COLUMN "owner_id" TO "created_by_user_id";

-- 4. Make column nullable
ALTER TABLE "ontologies" ALTER COLUMN "created_by_user_id" DROP NOT NULL;

-- 5. Create new FK constraint with ON DELETE SET NULL
ALTER TABLE "ontologies" ADD CONSTRAINT "ontologies_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Create new index
CREATE INDEX "ontologies_created_by_user_id_idx" ON "ontologies"("created_by_user_id");
