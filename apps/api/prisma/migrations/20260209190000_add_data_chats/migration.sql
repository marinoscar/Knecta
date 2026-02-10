-- CreateTable
CREATE TABLE "data_chats" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "ontology_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "data_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_chat_messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'complete',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_chats_owner_id_idx" ON "data_chats"("owner_id");

-- CreateIndex
CREATE INDEX "data_chats_ontology_id_idx" ON "data_chats"("ontology_id");

-- CreateIndex
CREATE INDEX "data_chat_messages_chat_id_idx" ON "data_chat_messages"("chat_id");

-- AddForeignKey
ALTER TABLE "data_chats" ADD CONSTRAINT "data_chats_ontology_id_fkey" FOREIGN KEY ("ontology_id") REFERENCES "ontologies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_chats" ADD CONSTRAINT "data_chats_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_chat_messages" ADD CONSTRAINT "data_chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "data_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
