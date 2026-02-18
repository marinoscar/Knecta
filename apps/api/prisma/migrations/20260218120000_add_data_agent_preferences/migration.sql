CREATE TABLE "data_agent_preferences" (
  "id"          UUID DEFAULT gen_random_uuid() NOT NULL,
  "user_id"     UUID NOT NULL,
  "ontology_id" UUID,
  "key"         VARCHAR(255) NOT NULL,
  "value"       TEXT NOT NULL,
  "source"      VARCHAR(20) NOT NULL DEFAULT 'manual',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "data_agent_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_agent_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "data_agent_preferences_ontology_id_fkey"
    FOREIGN KEY ("ontology_id") REFERENCES "ontologies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "data_agent_preferences_user_ontology_key_unique"
    UNIQUE ("user_id", "ontology_id", "key")
);
CREATE INDEX "data_agent_preferences_user_id_idx" ON "data_agent_preferences"("user_id");
CREATE INDEX "data_agent_preferences_ontology_id_idx" ON "data_agent_preferences"("ontology_id");
