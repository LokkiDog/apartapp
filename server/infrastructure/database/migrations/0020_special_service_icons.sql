ALTER TABLE "special_services" ADD COLUMN "icon_name" text NOT NULL DEFAULT 'i-lucide-concierge-bell';--> statement-breakpoint
ALTER TABLE "stay_services" ADD COLUMN "icon_name_snapshot" text NOT NULL DEFAULT 'i-lucide-concierge-bell';--> statement-breakpoint
UPDATE "stay_services" AS stay_service
SET "icon_name_snapshot" = special_service."icon_name"
FROM "special_services" AS special_service
WHERE stay_service."special_service_id" = special_service."id";
