-- CreateEnum
CREATE TYPE "DataImportStatus" AS ENUM ('draft', 'pending', 'importing', 'ready', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "DataImportRunStatus" AS ENUM ('pending', 'parsing', 'converting', 'uploading', 'connecting', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "data_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "source_file_name" VARCHAR(255) NOT NULL,
    "source_file_type" VARCHAR(10) NOT NULL,
    "source_file_size_bytes" BIGINT NOT NULL,
    "source_storage_path" VARCHAR(1000) NOT NULL,
    "status" "DataImportStatus" NOT NULL DEFAULT 'draft',
    "config" JSONB,
    "parse_result" JSONB,
    "output_tables" JSONB,
    "total_row_count" BIGINT,
    "total_size_bytes" BIGINT,
    "error_message" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_import_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "import_id" UUID NOT NULL,
    "status" "DataImportRunStatus" NOT NULL DEFAULT 'pending',
    "current_phase" VARCHAR(50),
    "progress" JSONB,
    "config" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "data_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_imports_created_by_user_id_idx" ON "data_imports"("created_by_user_id");

-- CreateIndex
CREATE INDEX "data_imports_status_idx" ON "data_imports"("status");

-- CreateIndex
CREATE INDEX "data_imports_created_at_idx" ON "data_imports"("created_at");

-- CreateIndex
CREATE INDEX "data_import_runs_import_id_idx" ON "data_import_runs"("import_id");

-- CreateIndex
CREATE INDEX "data_import_runs_status_idx" ON "data_import_runs"("status");

-- AddForeignKey
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_import_runs" ADD CONSTRAINT "data_import_runs_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "data_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_import_runs" ADD CONSTRAINT "data_import_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
