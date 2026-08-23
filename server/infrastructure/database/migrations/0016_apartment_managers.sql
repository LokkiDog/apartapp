CREATE TABLE "apartment_managers" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "apartment_id" uuid NOT NULL REFERENCES "apartments"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "apartment_managers_apartment_id_user_id_pk" PRIMARY KEY("apartment_id", "user_id")
);--> statement-breakpoint
CREATE INDEX "apartment_managers_organization_user_idx" ON "apartment_managers" USING btree ("organization_id", "user_id");--> statement-breakpoint
CREATE INDEX "apartment_managers_organization_apartment_idx" ON "apartment_managers" USING btree ("organization_id", "apartment_id");--> statement-breakpoint
INSERT INTO "apartment_managers" ("organization_id", "apartment_id", "user_id")
SELECT "organization_id", "id", "manager_id"
FROM "apartments"
WHERE "manager_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "manager_team_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
UPDATE "financial_entries" AS entry
SET "manager_team_snapshot" = CASE
  WHEN entry."manager_id" IS NULL THEN '[]'::jsonb
  ELSE COALESCE((
    SELECT jsonb_build_array(jsonb_build_object('id', "id", 'name', "name"))
    FROM "users"
    WHERE "id" = entry."manager_id"
  ), '[]'::jsonb)
END;--> statement-breakpoint
ALTER TABLE "financial_entries" DROP CONSTRAINT IF EXISTS "financial_entries_manager_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "financial_entries" DROP COLUMN "manager_id";--> statement-breakpoint
ALTER TABLE "apartments" DROP CONSTRAINT IF EXISTS "apartments_manager_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "apartments" DROP COLUMN "manager_id";
