CREATE TABLE "apartment_type_consumable_write_offs" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "apartment_type_id" uuid NOT NULL REFERENCES "apartment_types"("id") ON DELETE CASCADE,
  "consumable_id" uuid NOT NULL REFERENCES "consumables"("id") ON DELETE CASCADE,
  "quantity" numeric(12, 3) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "apartment_type_write_off_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "apartment_type_consumable_write_offs_pk" PRIMARY KEY ("apartment_type_id", "consumable_id")
);
--> statement-breakpoint
CREATE INDEX "apartment_type_write_off_org_type_idx" ON "apartment_type_consumable_write_offs" USING btree ("organization_id", "apartment_type_id");
--> statement-breakpoint
ALTER TABLE "consumables" DROP CONSTRAINT IF EXISTS "consumable_auto_write_off_valid";
--> statement-breakpoint
ALTER TABLE "consumables" DROP COLUMN IF EXISTS "auto_write_off_enabled";
--> statement-breakpoint
ALTER TABLE "consumables" DROP COLUMN IF EXISTS "auto_write_off_quantity";
