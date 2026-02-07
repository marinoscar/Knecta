-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('postgresql', 'mysql', 'sqlserver', 'databricks', 'snowflake');

-- CreateTable
CREATE TABLE "data_connections" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "db_type" "DatabaseType" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "database_name" TEXT,
    "username" TEXT,
    "encrypted_credential" TEXT,
    "use_ssl" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "owner_id" UUID NOT NULL,
    "last_tested_at" TIMESTAMPTZ,
    "last_test_result" BOOLEAN,
    "last_test_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "data_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_connections_owner_id_idx" ON "data_connections"("owner_id");

-- CreateIndex
CREATE INDEX "data_connections_db_type_idx" ON "data_connections"("db_type");

-- AddForeignKey
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
