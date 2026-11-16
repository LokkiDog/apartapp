ALTER TABLE "public_sites"
  ALTER COLUMN "website_url" DROP NOT NULL,
  ADD COLUMN "slug" text,
  ADD COLUMN "address_locked" boolean DEFAULT false NOT NULL,
  ADD COLUMN "title" text DEFAULT '' NOT NULL,
  ADD COLUMN "description" text DEFAULT '' NOT NULL,
  ADD COLUMN "accent" text DEFAULT 'gold' NOT NULL;
