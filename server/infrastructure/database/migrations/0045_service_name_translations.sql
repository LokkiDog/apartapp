ALTER TABLE "special_services" ADD COLUMN "name_translations" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "stay_services" ADD COLUMN "name_translations_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
