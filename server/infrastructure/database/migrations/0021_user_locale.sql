CREATE TYPE "public"."app_locale" AS ENUM('ru', 'en', 'he');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" "public"."app_locale" DEFAULT 'ru' NOT NULL;
