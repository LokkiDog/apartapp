CREATE TYPE "public"."app_currency" AS ENUM ('EUR', 'USD', 'THB', 'RUB');
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "currency" "app_currency" DEFAULT 'EUR' NOT NULL;
