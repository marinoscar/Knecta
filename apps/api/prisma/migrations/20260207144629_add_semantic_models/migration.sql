-- CreateEnum
CREATE TYPE "SemanticModelStatus" AS ENUM ('draft', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('pending', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "semantic_models" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "connection_id" UUID NOT NULL,
    "database_name" TEXT NOT NULL,
    "status" "SemanticModelStatus" NOT NULL DEFAULT 'draft',
    "model" JSONB,
    "model_version" INTEGER NOT NULL DEFAULT 1,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "field_count" INTEGER NOT NULL DEFAULT 0,
    "relationship_count" INTEGER NOT NULL DEFAULT 0,
    "metric_count" INTEGER NOT NULL DEFAULT 0,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "semantic_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_model_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "semantic_model_id" UUID,
    "connection_id" UUID NOT NULL,
    "database_name" TEXT NOT NULL,
    "selected_schemas" TEXT[],
    "selected_tables" TEXT[],
    "status" "RunStatus" NOT NULL DEFAULT 'pending',
    "plan" JSONB,
    "progress" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "semantic_model_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semantic_models_owner_id_idx" ON "semantic_models"("owner_id");

-- CreateIndex
CREATE INDEX "semantic_models_connection_id_idx" ON "semantic_models"("connection_id");

-- CreateIndex
CREATE INDEX "semantic_models_status_idx" ON "semantic_models"("status");

-- CreateIndex
CREATE INDEX "semantic_model_runs_owner_id_idx" ON "semantic_model_runs"("owner_id");

-- CreateIndex
CREATE INDEX "semantic_model_runs_semantic_model_id_idx" ON "semantic_model_runs"("semantic_model_id");

-- CreateIndex
CREATE INDEX "semantic_model_runs_connection_id_idx" ON "semantic_model_runs"("connection_id");

-- CreateIndex
CREATE INDEX "semantic_model_runs_status_idx" ON "semantic_model_runs"("status");

-- AddForeignKey
ALTER TABLE "semantic_models" ADD CONSTRAINT "semantic_models_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_models" ADD CONSTRAINT "semantic_models_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "data_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_model_runs" ADD CONSTRAINT "semantic_model_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_model_runs" ADD CONSTRAINT "semantic_model_runs_semantic_model_id_fkey" FOREIGN KEY ("semantic_model_id") REFERENCES "semantic_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_model_runs" ADD CONSTRAINT "semantic_model_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "data_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
