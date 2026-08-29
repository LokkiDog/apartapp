ALTER TABLE "cleaning_inventory_reports" ADD COLUMN "approved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "cleaning_inventory_reports" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cleaning_inventory_reports" ADD CONSTRAINT "cleaning_inventory_reports_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cleaning_inventory_report_approval_idx" ON "cleaning_inventory_reports" USING btree ("organization_id", "approved_at");
