-- Preserve access for existing clients. New clients opt in.
ALTER TABLE "organizations" ADD COLUMN "guests_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "guests_enabled" SET DEFAULT false;
