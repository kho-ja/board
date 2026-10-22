-- Auth + multi-board migration.
--
-- Introduces `users`, `sessions`, `boards` and `board_members`, and makes every
-- board-scoped table (`blocks`, `placements`, `memberships`, `links`, `types`,
-- `views`) belong to exactly one board.
--
-- Fresh installs do not need this file: `npm run db:push` creates the current
-- schema from `src/db/schema.ts`. This file exists for installs that already
-- have data, because adding a NOT NULL column to a populated table needs a
-- backfill that a schema diff cannot express.
--
-- Idempotent: every statement is safe to run against an already-migrated
-- database.

BEGIN;

-- ---------- Accounts ----------

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "password_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");

-- ---------- Boards ----------

CREATE TABLE IF NOT EXISTS "boards" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  -- Nullable: a board with no owner is *unclaimed*. The first account to
  -- register takes it over, so a local install does not lose its content.
  -- SET NULL rather than CASCADE: removing an account must not destroy a
  -- board other people are working on.
  "owner_id" text REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "boards_owner_idx" ON "boards" ("owner_id");

CREATE TABLE IF NOT EXISTS "board_members" (
  "board_id" text NOT NULL REFERENCES "boards" ("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "role" text DEFAULT 'editor' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "board_members_unique_idx"
  ON "board_members" ("board_id", "user_id");
CREATE INDEX IF NOT EXISTS "board_members_user_idx" ON "board_members" ("user_id");

-- ---------- Board scope on the content tables ----------

-- Nullable first: the backfill below needs to run before NOT NULL.
ALTER TABLE "blocks" ADD COLUMN IF NOT EXISTS "board_id" text;
ALTER TABLE "placements" ADD COLUMN IF NOT EXISTS "board_id" text;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "board_id" text;
ALTER TABLE "links" ADD COLUMN IF NOT EXISTS "board_id" text;
ALTER TABLE "types" ADD COLUMN IF NOT EXISTS "board_id" text;
ALTER TABLE "views" ADD COLUMN IF NOT EXISTS "board_id" text;

-- Park the pre-auth content on one unclaimed board.
INSERT INTO "boards" ("id", "name", "owner_id", "created_at", "updated_at")
VALUES ('legacy', 'My board', NULL, now(), now())
ON CONFLICT ("id") DO NOTHING;

UPDATE "blocks" SET "board_id" = 'legacy' WHERE "board_id" IS NULL;
UPDATE "placements" SET "board_id" = 'legacy' WHERE "board_id" IS NULL;
UPDATE "memberships" SET "board_id" = 'legacy' WHERE "board_id" IS NULL;
UPDATE "links" SET "board_id" = 'legacy' WHERE "board_id" IS NULL;
UPDATE "types" SET "board_id" = 'legacy' WHERE "board_id" IS NULL;
UPDATE "views" SET "board_id" = 'legacy' WHERE "board_id" IS NULL;

ALTER TABLE "blocks" ALTER COLUMN "board_id" SET NOT NULL;
ALTER TABLE "placements" ALTER COLUMN "board_id" SET NOT NULL;
ALTER TABLE "memberships" ALTER COLUMN "board_id" SET NOT NULL;
ALTER TABLE "links" ALTER COLUMN "board_id" SET NOT NULL;
ALTER TABLE "types" ALTER COLUMN "board_id" SET NOT NULL;
ALTER TABLE "views" ALTER COLUMN "board_id" SET NOT NULL;

-- Replace the single-column block references with board-scoped ones.
ALTER TABLE "placements" DROP CONSTRAINT IF EXISTS "placements_block_id_blocks_id_fk";
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_group_id_blocks_id_fk";
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_member_id_blocks_id_fk";
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "links_block_a_id_blocks_id_fk";
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "links_block_b_id_blocks_id_fk";

-- The board-scoped references point at (id, board_id) on `blocks`, so they
-- have to go before that target is replaced.
ALTER TABLE "placements" DROP CONSTRAINT IF EXISTS "placements_block_board_fk";
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_group_board_fk";
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_member_board_fk";
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "links_block_a_board_fk";
ALTER TABLE "links" DROP CONSTRAINT IF EXISTS "links_block_b_board_fk";

-- Composite target for the board-scoped block references below: it is what
-- makes it impossible for a placement or link to cross board boundaries.
--
-- A UNIQUE *constraint* rather than a bare index: drizzle-kit only recognises
-- a constraint as the backing of a foreign key, so a bare unique index here
-- would make `db:push` try to create it a second time.
DROP INDEX IF EXISTS "blocks_id_board_idx";
ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_id_board_unique";
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_id_board_unique" UNIQUE ("id", "board_id");

-- Re-created below with ON DELETE SET NULL.
ALTER TABLE "boards" DROP CONSTRAINT IF EXISTS "boards_owner_id_users_id_fk";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boards_owner_id_users_id_fk'
  ) THEN
    ALTER TABLE "boards" ADD CONSTRAINT "boards_owner_id_users_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blocks_board_id_boards_id_fk'
  ) THEN
    ALTER TABLE "blocks" ADD CONSTRAINT "blocks_board_id_boards_id_fk"
      FOREIGN KEY ("board_id") REFERENCES "boards" ("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'types_board_id_boards_id_fk'
  ) THEN
    ALTER TABLE "types" ADD CONSTRAINT "types_board_id_boards_id_fk"
      FOREIGN KEY ("board_id") REFERENCES "boards" ("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'views_board_id_boards_id_fk'
  ) THEN
    ALTER TABLE "views" ADD CONSTRAINT "views_board_id_boards_id_fk"
      FOREIGN KEY ("board_id") REFERENCES "boards" ("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'placements_block_board_fk'
  ) THEN
    ALTER TABLE "placements" ADD CONSTRAINT "placements_block_board_fk"
      FOREIGN KEY ("block_id", "board_id") REFERENCES "blocks" ("id", "board_id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memberships_group_board_fk'
  ) THEN
    ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_board_fk"
      FOREIGN KEY ("group_id", "board_id") REFERENCES "blocks" ("id", "board_id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memberships_member_board_fk'
  ) THEN
    ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_board_fk"
      FOREIGN KEY ("member_id", "board_id") REFERENCES "blocks" ("id", "board_id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'links_block_a_board_fk'
  ) THEN
    ALTER TABLE "links" ADD CONSTRAINT "links_block_a_board_fk"
      FOREIGN KEY ("block_a_id", "board_id") REFERENCES "blocks" ("id", "board_id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'links_block_b_board_fk'
  ) THEN
    ALTER TABLE "links" ADD CONSTRAINT "links_block_b_board_fk"
      FOREIGN KEY ("block_b_id", "board_id") REFERENCES "blocks" ("id", "board_id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "blocks_board_idx" ON "blocks" ("board_id");
CREATE INDEX IF NOT EXISTS "placements_board_idx" ON "placements" ("board_id");
CREATE INDEX IF NOT EXISTS "memberships_board_idx" ON "memberships" ("board_id");
CREATE INDEX IF NOT EXISTS "links_board_idx" ON "links" ("board_id");
CREATE INDEX IF NOT EXISTS "types_board_idx" ON "types" ("board_id");
CREATE INDEX IF NOT EXISTS "views_board_idx" ON "views" ("board_id");

-- Redundant with the primary key on placements(block_id).
DROP INDEX IF EXISTS "placements_block_idx";

-- ---------- API keys become per-user ----------

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "user_id" text;
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_provider_unique";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
END $$;

DELETE FROM "api_keys" WHERE "user_id" IS NULL;

ALTER TABLE "api_keys" ALTER COLUMN "user_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_user_provider_idx"
  ON "api_keys" ("user_id", "provider");

COMMIT;
