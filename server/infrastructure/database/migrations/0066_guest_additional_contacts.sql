ALTER TABLE "guests"
  ADD COLUMN "additional_phones" text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN "additional_emails" text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN "additional_whatsapps" text[] NOT NULL DEFAULT ARRAY[]::text[];
