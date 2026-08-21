CREATE TYPE "manager_expense_category" AS ENUM('cleaning', 'inventory', 'task');--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'manager_expense_report_published';--> statement-breakpoint
CREATE TABLE "manager_expense_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "apartment_id" uuid NOT NULL REFERENCES "apartments"("id") ON DELETE CASCADE,
  "month" date NOT NULL,
  "published_at" timestamp with time zone,
  "published_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "manager_expense_report_apartment_month_unique" ON "manager_expense_reports" USING btree ("organization_id", "apartment_id", "month");--> statement-breakpoint
CREATE INDEX "manager_expense_report_month_idx" ON "manager_expense_reports" USING btree ("organization_id", "month");--> statement-breakpoint
CREATE TABLE "manager_expense_report_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL REFERENCES "manager_expense_reports"("id") ON DELETE CASCADE,
  "category" "manager_expense_category" NOT NULL,
  "description" text NOT NULL,
  "occurred_on" date,
  "amount_eur" numeric(12, 2) NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "manager_expense_report_line_order_idx" ON "manager_expense_report_lines" USING btree ("report_id", "category", "position");
