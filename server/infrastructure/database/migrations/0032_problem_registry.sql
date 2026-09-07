ALTER TABLE "cleaning_problems" ADD COLUMN "apartment_id" uuid;
--> statement-breakpoint
UPDATE "cleaning_problems"
SET "apartment_id" = "cleanings"."apartment_id"
FROM "cleanings"
WHERE "cleaning_problems"."cleaning_id" = "cleanings"."id";
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ALTER COLUMN "apartment_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD COLUMN "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD COLUMN "resolved_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD COLUMN "resolution_comment" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" DROP CONSTRAINT "cleaning_problems_cleaning_id_cleanings_id_fk";
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ALTER COLUMN "cleaning_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_cleaning_id_cleanings_id_fk" FOREIGN KEY ("cleaning_id") REFERENCES "public"."cleanings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD CONSTRAINT "cleaning_problems_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cleaning_problem_list_idx" ON "cleaning_problems" USING btree ("organization_id", "resolved_at", "apartment_id");
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "problem_id" uuid;
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_problem_id_cleaning_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."cleaning_problems"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "financial_entries_problem_idx" ON "financial_entries" USING btree ("problem_id");
--> statement-breakpoint
ALTER TABLE "manager_expense_report_lines" ADD COLUMN "included" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "manager_expense_report_lines" ADD COLUMN "problem_id" uuid;
--> statement-breakpoint
ALTER TABLE "manager_expense_report_lines" ADD CONSTRAINT "manager_expense_report_lines_problem_id_cleaning_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."cleaning_problems"("id") ON DELETE set null ON UPDATE no action;
