-- CreateTable
CREATE TABLE "llm_traces" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "phase" VARCHAR(30) NOT NULL,
    "call_index" INTEGER NOT NULL,
    "step_id" INTEGER,
    "purpose" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "temperature" DOUBLE PRECISION,
    "structured_output" BOOLEAN NOT NULL DEFAULT false,
    "prompt_messages" JSONB NOT NULL,
    "response_content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_traces_message_id_idx" ON "llm_traces"("message_id");

-- CreateIndex
CREATE INDEX "llm_traces_message_id_phase_idx" ON "llm_traces"("message_id", "phase");

-- AddForeignKey
ALTER TABLE "llm_traces" ADD CONSTRAINT "llm_traces_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "data_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
