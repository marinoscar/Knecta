-- CreateTable
CREATE TABLE "data_chat_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chat_id" UUID NOT NULL,
    "share_token" VARCHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_chat_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_chat_shares_share_token_key" ON "data_chat_shares"("share_token");

-- CreateIndex
CREATE INDEX "data_chat_shares_chat_id_idx" ON "data_chat_shares"("chat_id");

-- CreateIndex
CREATE INDEX "data_chat_shares_share_token_idx" ON "data_chat_shares"("share_token");

-- CreateIndex
CREATE INDEX "data_chat_shares_created_by_id_idx" ON "data_chat_shares"("created_by_id");

-- AddForeignKey
ALTER TABLE "data_chat_shares" ADD CONSTRAINT "data_chat_shares_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "data_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_chat_shares" ADD CONSTRAINT "data_chat_shares_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
