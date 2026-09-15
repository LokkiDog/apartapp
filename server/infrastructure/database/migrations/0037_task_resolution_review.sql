ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'task_resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'task_returned';--> statement-breakpoint
DROP INDEX IF EXISTS "task_active_problem_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "task_active_problem_unique" ON "tasks" USING btree ("problem_id") WHERE "problem_id" IS NOT NULL AND "status" IN ('open', 'in_progress', 'resolved');
