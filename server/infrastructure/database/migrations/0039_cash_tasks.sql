CREATE TYPE "task_category" AS ENUM('general', 'cash');--> statement-breakpoint
ALTER TYPE "financial_entry_type" ADD VALUE IF NOT EXISTS 'cash_receipt';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "category" "task_category" NOT NULL DEFAULT 'general';--> statement-breakpoint
CREATE TABLE "cash_task_details" (
  "task_id" uuid PRIMARY KEY NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "stay_id" uuid REFERENCES "stays"("id") ON DELETE set null,
  "cleaning_id" uuid REFERENCES "cleanings"("id") ON DELETE set null,
  "expected_amount_eur" numeric(12, 2) NOT NULL,
  "collected_amount_eur" numeric(12, 2),
  "collected_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "collected_at" timestamp with time zone,
  "received_amount_eur" numeric(12, 2),
  "received_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "received_at" timestamp with time zone,
  "report_included" boolean NOT NULL DEFAULT true,
  "report_occurred_on" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cash_task_amounts_nonnegative" CHECK ("expected_amount_eur" >= 0 AND ("collected_amount_eur" IS NULL OR "collected_amount_eur" >= 0) AND ("received_amount_eur" IS NULL OR "received_amount_eur" >= 0))
);--> statement-breakpoint
CREATE UNIQUE INDEX "cash_task_cleaning_unique" ON "cash_task_details" USING btree ("cleaning_id") WHERE "cleaning_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cash_task_org_stage_idx" ON "cash_task_details" USING btree ("organization_id", "collected_at", "received_at");--> statement-breakpoint
CREATE INDEX "cash_task_stay_idx" ON "cash_task_details" USING btree ("stay_id");--> statement-breakpoint
ALTER TABLE "manager_expense_report_lines" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "manager_expense_report_lines" ADD COLUMN "source_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "manager_expense_report_line_source_unique" ON "manager_expense_report_lines" USING btree ("report_id", "source_type", "source_id") WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL;
