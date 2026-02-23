-- CreateEnum
CREATE TYPE "SpreadsheetProjectStatus" AS ENUM ('draft', 'processing', 'review_pending', 'ready', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "SpreadsheetFileStatus" AS ENUM ('pending', 'analyzing', 'analyzed', 'extracting', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "SpreadsheetTableStatus" AS ENUM ('pending', 'extracting', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "SpreadsheetRunStatus" AS ENUM ('pending', 'ingesting', 'analyzing', 'designing', 'review_pending', 'extracting', 'validating', 'persisting', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "spreadsheet_projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "SpreadsheetProjectStatus" NOT NULL DEFAULT 'draft',
    "storage_provider" VARCHAR(20) NOT NULL,
    "output_bucket" VARCHAR(255) NOT NULL,
    "output_prefix" VARCHAR(500) NOT NULL,
    "review_mode" VARCHAR(20) NOT NULL DEFAULT 'review',
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "total_rows" BIGINT NOT NULL DEFAULT 0,
    "total_size_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spreadsheet_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "storage_object_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(20) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "storage_path" VARCHAR(1000) NOT NULL,
    "sheet_count" INTEGER NOT NULL DEFAULT 0,
    "status" "SpreadsheetFileStatus" NOT NULL DEFAULT 'pending',
    "analysis" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spreadsheet_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sheet_name" VARCHAR(255) NOT NULL,
    "table_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "row_count" BIGINT NOT NULL DEFAULT 0,
    "output_path" VARCHAR(1000),
    "output_size_bytes" BIGINT NOT NULL DEFAULT 0,
    "status" "SpreadsheetTableStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "extraction_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spreadsheet_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "status" "SpreadsheetRunStatus" NOT NULL DEFAULT 'pending',
    "current_phase" VARCHAR(50),
    "progress" JSONB,
    "extraction_plan" JSONB,
    "extraction_plan_modified" JSONB,
    "config" JSONB,
    "stats" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spreadsheet_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spreadsheet_projects_created_by_user_id_idx" ON "spreadsheet_projects"("created_by_user_id");

-- CreateIndex
CREATE INDEX "spreadsheet_projects_status_idx" ON "spreadsheet_projects"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_files_project_id_idx" ON "spreadsheet_files"("project_id");

-- CreateIndex
CREATE INDEX "spreadsheet_files_status_idx" ON "spreadsheet_files"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_tables_project_id_idx" ON "spreadsheet_tables"("project_id");

-- CreateIndex
CREATE INDEX "spreadsheet_tables_file_id_idx" ON "spreadsheet_tables"("file_id");

-- CreateIndex
CREATE INDEX "spreadsheet_tables_status_idx" ON "spreadsheet_tables"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_runs_project_id_idx" ON "spreadsheet_runs"("project_id");

-- CreateIndex
CREATE INDEX "spreadsheet_runs_status_idx" ON "spreadsheet_runs"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_runs_created_by_user_id_idx" ON "spreadsheet_runs"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "spreadsheet_projects" ADD CONSTRAINT "spreadsheet_projects_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_files" ADD CONSTRAINT "spreadsheet_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "spreadsheet_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_tables" ADD CONSTRAINT "spreadsheet_tables_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "spreadsheet_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_tables" ADD CONSTRAINT "spreadsheet_tables_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "spreadsheet_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_runs" ADD CONSTRAINT "spreadsheet_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "spreadsheet_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_runs" ADD CONSTRAINT "spreadsheet_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
