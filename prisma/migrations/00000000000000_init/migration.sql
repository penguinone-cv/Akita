CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "OperationKind" AS ENUM (
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'CATEGORY_REORDERED',
  'ITEM_CREATED',
  'ITEM_UPDATED',
  'ITEM_DELETED',
  'ITEM_RESTORED',
  'ITEM_REORDERED',
  'STOCK_ADJUSTED',
  'STOCK_SET',
  'STOCK_UNDONE'
);

CREATE TABLE "households" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "category_order_version" INTEGER NOT NULL DEFAULT 0,
  "event_seq" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "name_key" VARCHAR(160) NOT NULL,
  "position" INTEGER NOT NULL,
  "metadata_version" INTEGER NOT NULL DEFAULT 0,
  "items_order_version" INTEGER NOT NULL DEFAULT 0,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "categories_system_not_deletable" CHECK (NOT "is_system" OR "deleted_at" IS NULL)
);

CREATE TABLE "items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "name_key" VARCHAR(240) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER NOT NULL,
  "metadata_version" INTEGER NOT NULL DEFAULT 0,
  "stock_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "items_quantity_nonnegative" CHECK ("quantity" >= 0)
);

CREATE TABLE "operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "household_seq" BIGINT NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "kind" "OperationKind" NOT NULL,
  "aggregate_type" VARCHAR(32) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "delta" INTEGER,
  "before" JSONB,
  "after" JSONB,
  "event_payload" JSONB NOT NULL,
  "response_payload" JSONB,
  "undo_token_hash" CHAR(64),
  "undo_expires_at" TIMESTAMPTZ(3),
  "undone_at" TIMESTAMPTZ(3),
  "undo_of_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_id_household_id_key" ON "categories"("id", "household_id");
CREATE INDEX "categories_household_id_position_idx" ON "categories"("household_id", "position");
CREATE UNIQUE INDEX "categories_active_name_uq" ON "categories"("household_id", "name_key") WHERE "deleted_at" IS NULL;

CREATE INDEX "items_household_id_category_id_position_idx" ON "items"("household_id", "category_id", "position");
CREATE UNIQUE INDEX "items_active_name_uq" ON "items"("household_id", "category_id", "name_key") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "operations_undo_of_id_key" ON "operations"("undo_of_id");
CREATE UNIQUE INDEX "operations_household_id_household_seq_key" ON "operations"("household_id", "household_seq");
CREATE UNIQUE INDEX "operations_household_id_idempotency_key_key" ON "operations"("household_id", "idempotency_key");
CREATE INDEX "operations_household_id_household_seq_idx" ON "operations"("household_id", "household_seq");
CREATE INDEX "operations_household_id_aggregate_type_aggregate_id_idx" ON "operations"("household_id", "aggregate_type", "aggregate_id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "items" ADD CONSTRAINT "items_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "items" ADD CONSTRAINT "items_category_id_household_id_fkey"
  FOREIGN KEY ("category_id", "household_id") REFERENCES "categories"("id", "household_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations" ADD CONSTRAINT "operations_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations" ADD CONSTRAINT "operations_undo_of_id_fkey"
  FOREIGN KEY ("undo_of_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The application is intentionally single-household for the MVP. Keeping this
-- bootstrap in the migration makes a migrate-only deployment immediately usable.
INSERT INTO "households" ("id", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'わが家')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "categories" (
  "id", "household_id", "name", "name_key", "position", "is_system"
)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '未分類',
  '未分類',
  1000,
  true
)
ON CONFLICT ("id") DO NOTHING;
