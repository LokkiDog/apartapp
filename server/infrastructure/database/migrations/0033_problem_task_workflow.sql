ALTER TABLE "cleaning_problems" ADD COLUMN "source_task_id" uuid;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD COLUMN "deletion_requested_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD COLUMN "deletion_requested_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "problem_id" uuid;
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "href" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_deletion_requested_by_id_users_id_fk" FOREIGN KEY ("deletion_requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_problem_id_cleaning_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."cleaning_problems"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cleaning_problem_source_task_unique" ON "cleaning_problems" USING btree ("source_task_id") WHERE "source_task_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "task_problem_idx" ON "tasks" USING btree ("problem_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "task_active_problem_unique" ON "tasks" USING btree ("problem_id") WHERE "problem_id" IS NOT NULL AND "status" IN ('open', 'in_progress');
--> statement-breakpoint
INSERT INTO "cleaning_problems" ("organization_id", "apartment_id", "source_task_id", "description", "created_by_id", "created_at", "updated_at")
SELECT t."organization_id", t."apartment_id", t."id", t."problem_description", t."created_by_id", COALESCE(t."completed_at", t."updated_at", t."created_at"), COALESCE(t."updated_at", t."created_at")
FROM "tasks" t
WHERE t."has_problem" = true AND btrim(t."problem_description") <> ''
  AND NOT EXISTS (SELECT 1 FROM "cleaning_problems" p WHERE p."source_task_id" = t."id");
--> statement-breakpoint
UPDATE "notifications" n SET "href" = '/problems?problemId=' || p."id"
FROM "cleaning_problems" p
WHERE n."type" = 'problem' AND n."href" = '/tasks/' || p."source_task_id"::text;
--> statement-breakpoint
UPDATE "notifications" n SET "href" = '/problems?problemId=' || p."id"
FROM "cleaning_problems" p
WHERE n."type" = 'problem' AND n."href" = '/cleanings/' || p."cleaning_id"::text
  AND (SELECT count(*) FROM "cleaning_problems" x WHERE x."cleaning_id" = p."cleaning_id") = 1;
