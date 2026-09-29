CREATE TYPE "stay_source" AS ENUM ('manual', 'ical');
CREATE TYPE "stay_state" AS ENUM ('active', 'canceled', 'superseded', 'hidden');
ALTER TYPE "notification_type" ADD VALUE 'stay_conflict';

ALTER TABLE "stays" ALTER COLUMN "adult_count" DROP NOT NULL;
ALTER TABLE "stays" ALTER COLUMN "child_count" DROP NOT NULL;
ALTER TABLE "stays" ALTER COLUMN "created_by_id" DROP NOT NULL;
ALTER TABLE "stays" ADD COLUMN "source" "stay_source" NOT NULL DEFAULT 'manual';
ALTER TABLE "stays" ADD COLUMN "state" "stay_state" NOT NULL DEFAULT 'active';
ALTER TABLE "stays" ADD COLUMN "ical_feed_id" uuid;
ALTER TABLE "stays" ADD COLUMN "ical_uid" text;
ALTER TABLE "stays" ADD COLUMN "ical_summary" text;
ALTER TABLE "stays" ADD COLUMN "ical_missing_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "stays" ADD CONSTRAINT "stay_guest_counts_valid" CHECK (("source" = 'ical' AND "adult_count" IS NULL AND "child_count" IS NULL) OR ("adult_count" >= 1 AND "child_count" >= 0));
CREATE UNIQUE INDEX "stay_ical_uid_unique" ON "stays" USING btree ("ical_feed_id", "ical_uid") WHERE "ical_uid" IS NOT NULL;

CREATE TABLE "ical_feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "apartment_id" uuid NOT NULL REFERENCES "apartments"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_synced_at" timestamp with time zone,
  "last_error" text DEFAULT '' NOT NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "ical_feed_apartment_unique" ON "ical_feeds" USING btree ("apartment_id");
CREATE INDEX "ical_feed_org_enabled_idx" ON "ical_feeds" USING btree ("organization_id", "enabled");
ALTER TABLE "stays" ADD CONSTRAINT "stays_ical_feed_id_fkey" FOREIGN KEY ("ical_feed_id") REFERENCES "ical_feeds"("id") ON DELETE SET NULL;

CREATE TABLE "ical_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "apartment_id" uuid NOT NULL REFERENCES "apartments"("id") ON DELETE CASCADE,
  "imported_stay_id" uuid NOT NULL REFERENCES "stays"("id") ON DELETE CASCADE,
  "existing_stay_id" uuid NOT NULL REFERENCES "stays"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'open' NOT NULL,
  "decision" text,
  "resolved_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "ical_conflict_open_pair_unique" ON "ical_conflicts" USING btree ("imported_stay_id", "existing_stay_id") WHERE "status" IN ('open', 'needs_admin', 'resolving');
CREATE INDEX "ical_conflict_org_status_idx" ON "ical_conflicts" USING btree ("organization_id", "status", "created_at");
