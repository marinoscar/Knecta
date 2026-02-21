-- CreateEnum
CREATE TYPE "SpreadsheetRunStatus" AS ENUM ('pending', 'executing', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "SpreadsheetTableStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "spreadsheet_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "status" "SpreadsheetRunStatus" NOT NULL DEFAULT 'pending',
    "storage_object_ids" TEXT[],
    "s3_output_prefix" TEXT,
    "plan" JSONB,
    "progress" JSONB,
    "error_message" TEXT,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "total_rows" BIGINT NOT NULL DEFAULT 0,
    "total_size_bytes" BIGINT NOT NULL DEFAULT 0,
    "instructions" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spreadsheet_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spreadsheet_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "source_file" TEXT NOT NULL,
    "source_sheet" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "row_count" BIGINT NOT NULL DEFAULT 0,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "storage_key" TEXT,
    "status" "SpreadsheetTableStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "spreadsheet_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spreadsheet_runs_created_by_user_id_idx" ON "spreadsheet_runs"("created_by_user_id");

-- CreateIndex
CREATE INDEX "spreadsheet_runs_status_idx" ON "spreadsheet_runs"("status");

-- CreateIndex
CREATE INDEX "spreadsheet_tables_run_id_idx" ON "spreadsheet_tables"("run_id");

-- CreateIndex
CREATE INDEX "spreadsheet_tables_status_idx" ON "spreadsheet_tables"("status");

-- AddForeignKey
ALTER TABLE "spreadsheet_runs" ADD CONSTRAINT "spreadsheet_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spreadsheet_tables" ADD CONSTRAINT "spreadsheet_tables_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "spreadsheet_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
