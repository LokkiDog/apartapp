ALTER TABLE "consumables"
  ADD COLUMN "auto_write_off_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "auto_write_off_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
  ADD CONSTRAINT "consumable_auto_write_off_valid"
    CHECK (("auto_write_off_enabled" = false AND "auto_write_off_quantity" = 0) OR ("auto_write_off_enabled" = true AND "auto_write_off_quantity" > 0));--> statement-breakpoint
ALTER TABLE "cleaning_inventory_reports" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
UPDATE "cleaning_inventory_reports" SET "applied_at" = "reported_at" WHERE "applied_at" IS NULL;
