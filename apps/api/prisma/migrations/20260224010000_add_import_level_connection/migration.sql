-- Add import-level connection reference to data_imports
ALTER TABLE "data_imports" ADD COLUMN "connection_id" UUID;

-- Foreign key to data_connections (SET NULL on delete)
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "data_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for connection lookups
CREATE INDEX "data_imports_connection_id_idx" ON "data_imports"("connection_id");
