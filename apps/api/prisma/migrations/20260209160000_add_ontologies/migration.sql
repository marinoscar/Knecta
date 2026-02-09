-- CreateEnum
CREATE TYPE "OntologyStatus" AS ENUM ('creating', 'ready', 'failed');

-- CreateTable
CREATE TABLE "ontologies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "semantic_model_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "OntologyStatus" NOT NULL DEFAULT 'creating',
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "relationship_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ontologies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ontologies_owner_id_idx" ON "ontologies"("owner_id");

-- CreateIndex
CREATE INDEX "ontologies_semantic_model_id_idx" ON "ontologies"("semantic_model_id");

-- CreateIndex
CREATE INDEX "ontologies_status_idx" ON "ontologies"("status");

-- AddForeignKey
ALTER TABLE "ontologies" ADD CONSTRAINT "ontologies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ontologies" ADD CONSTRAINT "ontologies_semantic_model_id_fkey" FOREIGN KEY ("semantic_model_id") REFERENCES "semantic_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
