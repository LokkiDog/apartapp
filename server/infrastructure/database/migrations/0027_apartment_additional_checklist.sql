ALTER TABLE "apartments" ADD COLUMN "additional_checklist" jsonb NOT NULL DEFAULT '[]'::jsonb;
