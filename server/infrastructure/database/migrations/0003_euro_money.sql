ALTER TABLE "apartment_types" DROP CONSTRAINT IF EXISTS "apartment_type_tariff_total";

ALTER TABLE "apartment_types"
  ADD COLUMN "owner_total_eur" numeric(12,2),
  ADD COLUMN "cleaner_pool_eur" numeric(12,2),
  ADD COLUMN "laundry_eur" numeric(12,2),
  ADD COLUMN "service_eur" numeric(12,2);
ALTER TABLE "special_services" ADD COLUMN "price_eur" numeric(12,2);
ALTER TABLE "stays" ADD COLUMN "cash_amount_eur" numeric(12,2);
ALTER TABLE "stay_services" ADD COLUMN "price_eur_snapshot" numeric(12,2);
ALTER TABLE "tasks" ADD COLUMN "owner_cost_eur" numeric(12,2);
ALTER TABLE "inventory_lots" ADD COLUMN "unit_cost_eur" numeric(12,2);
ALTER TABLE "inventory_movements" ADD COLUMN "total_cost_eur" numeric(12,2);
ALTER TABLE "financial_entries" ADD COLUMN "amount_eur" numeric(12,2);

UPDATE "apartment_types" SET
  "owner_total_eur" = round("owner_total_cents"::numeric / 100, 2),
  "cleaner_pool_eur" = round("cleaner_pool_cents"::numeric / 100, 2),
  "laundry_eur" = round("laundry_cents"::numeric / 100, 2),
  "service_eur" = round("service_cents"::numeric / 100, 2);
UPDATE "special_services" SET "price_eur" = round("price_cents"::numeric / 100, 2);
UPDATE "stays" SET "cash_amount_eur" = round("cash_amount_cents"::numeric / 100, 2) WHERE "cash_amount_cents" IS NOT NULL;
UPDATE "stay_services" SET "price_eur_snapshot" = round("price_cents_snapshot"::numeric / 100, 2);
UPDATE "tasks" SET "owner_cost_eur" = round("owner_cost_cents"::numeric / 100, 2);
UPDATE "inventory_lots" SET "unit_cost_eur" = round("unit_cost_cents"::numeric / 100, 2);
UPDATE "inventory_movements" SET "total_cost_eur" = round("total_cost_cents"::numeric / 100, 2);
UPDATE "financial_entries" SET "amount_eur" = round("amount_cents"::numeric / 100, 2);

UPDATE "apartments"
SET "tariff_override" = (("tariff_override" - 'ownerTotalCents' - 'cleanerPoolCents' - 'laundryCents' - 'serviceCents') || jsonb_build_object(
  'ownerTotalEur', round(("tariff_override"->>'ownerTotalCents')::numeric / 100, 2),
  'cleanerPoolEur', round(("tariff_override"->>'cleanerPoolCents')::numeric / 100, 2),
  'laundryEur', round(("tariff_override"->>'laundryCents')::numeric / 100, 2),
  'serviceEur', round(("tariff_override"->>'serviceCents')::numeric / 100, 2)
))
WHERE "tariff_override" IS NOT NULL;

UPDATE "cleanings"
SET "tariff_snapshot" = (("tariff_snapshot" - 'ownerTotalCents' - 'cleanerPoolCents' - 'laundryCents' - 'serviceCents') || jsonb_build_object(
  'ownerTotalEur', round(("tariff_snapshot"->>'ownerTotalCents')::numeric / 100, 2),
  'cleanerPoolEur', round(("tariff_snapshot"->>'cleanerPoolCents')::numeric / 100, 2),
  'laundryEur', round(("tariff_snapshot"->>'laundryCents')::numeric / 100, 2),
  'serviceEur', round(("tariff_snapshot"->>'serviceCents')::numeric / 100, 2)
));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "apartment_types" WHERE "owner_total_eur" <> round("owner_total_cents"::numeric / 100, 2)) THEN
    RAISE EXCEPTION 'EUR migration verification failed for apartment_types';
  END IF;
  IF EXISTS (SELECT 1 FROM "financial_entries" WHERE "amount_eur" <> round("amount_cents"::numeric / 100, 2)) THEN
    RAISE EXCEPTION 'EUR migration verification failed for financial_entries';
  END IF;
END $$;

ALTER TABLE "apartment_types"
  ALTER COLUMN "owner_total_eur" SET NOT NULL,
  ALTER COLUMN "cleaner_pool_eur" SET NOT NULL,
  ALTER COLUMN "laundry_eur" SET NOT NULL,
  ALTER COLUMN "service_eur" SET NOT NULL;
ALTER TABLE "special_services" ALTER COLUMN "price_eur" SET NOT NULL;
ALTER TABLE "stay_services" ALTER COLUMN "price_eur_snapshot" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "owner_cost_eur" SET NOT NULL, ALTER COLUMN "owner_cost_eur" SET DEFAULT 0;
ALTER TABLE "inventory_lots" ALTER COLUMN "unit_cost_eur" SET NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "total_cost_eur" SET NOT NULL, ALTER COLUMN "total_cost_eur" SET DEFAULT 0;
ALTER TABLE "financial_entries" ALTER COLUMN "amount_eur" SET NOT NULL;

ALTER TABLE "apartment_types" ADD CONSTRAINT "apartment_type_tariff_nonnegative" CHECK ("owner_total_eur" >= 0 AND "cleaner_pool_eur" >= 0 AND "laundry_eur" >= 0 AND "service_eur" >= 0);
ALTER TABLE "apartment_types" ADD CONSTRAINT "apartment_type_tariff_total" CHECK ("owner_total_eur" = "cleaner_pool_eur" + "laundry_eur" + "service_eur");
ALTER TABLE "special_services" ADD CONSTRAINT "special_service_price_nonnegative" CHECK ("price_eur" >= 0);
ALTER TABLE "stays" ADD CONSTRAINT "stay_cash_nonnegative" CHECK ("cash_amount_eur" IS NULL OR "cash_amount_eur" >= 0);
ALTER TABLE "stay_services" ADD CONSTRAINT "stay_service_price_nonnegative" CHECK ("price_eur_snapshot" >= 0);
ALTER TABLE "tasks" ADD CONSTRAINT "task_owner_cost_nonnegative" CHECK ("owner_cost_eur" >= 0);
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lot_cost_nonnegative" CHECK ("unit_cost_eur" >= 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movement_cost_nonnegative" CHECK ("total_cost_eur" >= 0);

ALTER TABLE "apartment_types" DROP COLUMN "owner_total_cents", DROP COLUMN "cleaner_pool_cents", DROP COLUMN "laundry_cents", DROP COLUMN "service_cents";
ALTER TABLE "special_services" DROP COLUMN "price_cents";
ALTER TABLE "stays" DROP COLUMN "cash_amount_cents";
ALTER TABLE "stay_services" DROP COLUMN "price_cents_snapshot";
ALTER TABLE "tasks" DROP COLUMN "owner_cost_cents";
ALTER TABLE "inventory_lots" DROP COLUMN "unit_cost_cents";
ALTER TABLE "inventory_movements" DROP COLUMN "total_cost_cents";
ALTER TABLE "financial_entries" DROP COLUMN "amount_cents";
