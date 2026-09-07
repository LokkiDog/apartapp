ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'specialist';

ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "automatic_linen_collection" boolean DEFAULT false NOT NULL;
ALTER TABLE "cleanings" ADD COLUMN IF NOT EXISTS "linen_collected" boolean DEFAULT false NOT NULL;
