UPDATE "cleanings" AS "cleaning"
SET "scheduled_on" = "stay"."check_out_on"
FROM "stays" AS "stay"
WHERE "cleaning"."stay_id" = "stay"."id"
  AND "cleaning"."scheduled_on" IS NULL;

UPDATE "cleanings"
SET "scheduled_on" = ("created_at" AT TIME ZONE 'Europe/Sofia')::date
WHERE "scheduled_on" IS NULL;

ALTER TABLE "cleanings" ALTER COLUMN "scheduled_on" SET NOT NULL;
