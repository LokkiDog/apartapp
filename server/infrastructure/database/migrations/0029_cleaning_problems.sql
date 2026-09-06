CREATE TABLE "cleaning_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cleaning_id" uuid NOT NULL,
	"description" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_cleaning_id_cleanings_id_fk" FOREIGN KEY ("cleaning_id") REFERENCES "public"."cleanings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cleaning_problem_cleaning_idx" ON "cleaning_problems" USING btree ("cleaning_id");
--> statement-breakpoint
WITH "migrated" AS (
	INSERT INTO "cleaning_problems" ("organization_id", "cleaning_id", "description")
	SELECT "cleanings"."organization_id", "cleanings"."id",
		CASE WHEN btrim("cleanings"."problem_description") <> '' THEN "cleanings"."problem_description" ELSE 'Ранее прикреплённые фотографии' END
	FROM "cleanings"
	WHERE "cleanings"."has_problem" = true
		OR btrim("cleanings"."problem_description") <> ''
		OR EXISTS (SELECT 1 FROM "attachments" WHERE "attachments"."entity_type" = 'cleaning' AND "attachments"."entity_id" = "cleanings"."id")
	RETURNING "id", "cleaning_id"
)
UPDATE "attachments"
SET "entity_type" = 'cleaning_problem', "entity_id" = "migrated"."id"
FROM "migrated"
WHERE "attachments"."entity_type" = 'cleaning' AND "attachments"."entity_id" = "migrated"."cleaning_id";
--> statement-breakpoint
UPDATE "cleanings"
SET "has_problem" = true,
	"problem_description" = (SELECT "description" FROM "cleaning_problems" WHERE "cleaning_problems"."cleaning_id" = "cleanings"."id" ORDER BY "created_at" LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "cleaning_problems" WHERE "cleaning_problems"."cleaning_id" = "cleanings"."id");
