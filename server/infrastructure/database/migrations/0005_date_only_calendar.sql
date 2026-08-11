ALTER TABLE "stays" ADD COLUMN "check_in_on" date, ADD COLUMN "check_out_on" date;
ALTER TABLE "cleanings" ADD COLUMN "scheduled_on" date;
ALTER TABLE "tasks" ADD COLUMN "due_on" date;

UPDATE "stays" SET "check_in_on" = ("check_in_at" AT TIME ZONE 'Europe/Sofia')::date, "check_out_on" = ("check_out_at" AT TIME ZONE 'Europe/Sofia')::date;
UPDATE "cleanings" SET "scheduled_on" = ("scheduled_at" AT TIME ZONE 'Europe/Sofia')::date;
UPDATE "tasks" SET "due_on" = ("due_at" AT TIME ZONE 'Europe/Sofia')::date WHERE "due_at" IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "stays" WHERE "check_in_on" IS NULL OR "check_out_on" IS NULL OR "check_out_on" <= "check_in_on") THEN RAISE EXCEPTION 'Date-only migration verification failed for stays'; END IF;
END $$;

ALTER TABLE "stays" ALTER COLUMN "check_in_on" SET NOT NULL, ALTER COLUMN "check_out_on" SET NOT NULL;
ALTER TABLE "stays" DROP CONSTRAINT IF EXISTS "stay_dates_order";
ALTER TABLE "stays" ADD CONSTRAINT "stay_dates_order" CHECK ("check_out_on" > "check_in_on");
ALTER TABLE "stays" DROP COLUMN "status", DROP COLUMN "check_in_at", DROP COLUMN "check_out_at";
ALTER TABLE "cleanings" DROP COLUMN "scheduled_at";
ALTER TABLE "tasks" DROP COLUMN "due_at";
DROP TYPE "stay_status";
