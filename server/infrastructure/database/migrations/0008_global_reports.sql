ALTER TABLE "apartment_consumables" ADD COLUMN "target_quantity" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "apartment_consumables" ALTER COLUMN "minimum_quantity" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "apartment_consumables" ALTER COLUMN "minimum_quantity" SET DATA TYPE integer USING CEIL("minimum_quantity")::integer;
--> statement-breakpoint
ALTER TABLE "apartment_consumables" ALTER COLUMN "minimum_quantity" SET DEFAULT 0;
--> statement-breakpoint
UPDATE "apartment_consumables"
SET "target_quantity" = CASE
  WHEN "minimum_quantity" > 0 THEN "minimum_quantity" * 2
  ELSE 0
END;
--> statement-breakpoint
ALTER TABLE "apartment_consumables" ADD CONSTRAINT "apartment_consumable_thresholds_valid"
CHECK ("minimum_quantity" >= 0 AND "target_quantity" >= 0 AND ("minimum_quantity" = 0 OR "target_quantity" > "minimum_quantity"));
--> statement-breakpoint
CREATE INDEX "apartment_consumable_report_idx" ON "apartment_consumables" USING btree ("apartment_id", "consumable_id");
--> statement-breakpoint
CREATE INDEX "inventory_lot_report_idx" ON "inventory_lots" USING btree ("apartment_id", "consumable_id");
--> statement-breakpoint
CREATE INDEX "cleaning_report_date_idx" ON "cleanings" USING btree ("organization_id", "scheduled_on");
--> statement-breakpoint
CREATE INDEX "task_report_date_idx" ON "tasks" USING btree ("organization_id", "due_on");
--> statement-breakpoint
CREATE INDEX "stay_report_dates_idx" ON "stays" USING btree ("organization_id", "check_in_on", "check_out_on");
--> statement-breakpoint
CREATE INDEX "financial_report_date_idx" ON "financial_entries" USING btree ("organization_id", "occurred_on");
