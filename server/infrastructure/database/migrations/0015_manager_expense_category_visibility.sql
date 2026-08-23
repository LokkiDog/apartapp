ALTER TABLE "manager_expense_reports" ADD COLUMN "cleaning_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "manager_expense_reports" ADD COLUMN "inventory_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "manager_expense_reports" ADD COLUMN "task_enabled" boolean DEFAULT true NOT NULL;
