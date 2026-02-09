-- Safety: convert any awaiting_approval rows to cancelled
UPDATE "semantic_model_runs" SET "status" = 'cancelled' WHERE "status" = 'awaiting_approval';

-- Create new enum type without awaiting_approval
CREATE TYPE "RunStatus_new" AS ENUM ('pending', 'planning', 'executing', 'completed', 'failed', 'cancelled');

-- Drop the default before altering the column type
ALTER TABLE "semantic_model_runs" ALTER COLUMN "status" DROP DEFAULT;

-- Alter column to use new type
ALTER TABLE "semantic_model_runs" ALTER COLUMN "status" TYPE "RunStatus_new" USING ("status"::text::"RunStatus_new");

-- Re-add the default
ALTER TABLE "semantic_model_runs" ALTER COLUMN "status" SET DEFAULT 'pending'::"RunStatus_new";

-- Drop old type and rename new one
DROP TYPE "RunStatus";
ALTER TYPE "RunStatus_new" RENAME TO "RunStatus";
