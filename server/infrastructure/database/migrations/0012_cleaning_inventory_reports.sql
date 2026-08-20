ALTER TABLE "inventory_movements" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE TABLE "cleaning_inventory_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "cleaning_id" uuid NOT NULL REFERENCES "cleanings"("id") ON DELETE CASCADE,
  "consumable_id" uuid NOT NULL REFERENCES "consumables"("id"),
  "used_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
  "remaining_quantity" numeric(12, 3) NOT NULL,
  "discrepancy_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
  "reported_by_id" uuid NOT NULL REFERENCES "users"("id"),
  "reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cleaning_inventory_report_quantities_nonnegative" CHECK ("used_quantity" >= 0 AND "remaining_quantity" >= 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "cleaning_inventory_report_unique" ON "cleaning_inventory_reports" USING btree ("cleaning_id", "consumable_id");--> statement-breakpoint
CREATE INDEX "cleaning_inventory_report_org_idx" ON "cleaning_inventory_reports" USING btree ("organization_id", "reported_at");
