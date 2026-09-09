ALTER TABLE "cleaning_problems" ADD COLUMN "details" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "problem_details" text DEFAULT '' NOT NULL;
