ALTER TABLE "users" ADD COLUMN "socials" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET "socials" = jsonb_build_array(jsonb_build_object('platform', 'whatsapp', 'value', trim("phone")))
WHERE regexp_replace(trim("phone"), '[[:space:]()+-]', '', 'g') ~ '^[1-9][0-9]{6,14}$';
--> statement-breakpoint
ALTER TABLE "public_sites"
  ADD COLUMN "host_description" jsonb DEFAULT '{"ru":"","en":"","he":"","bg":""}'::jsonb NOT NULL,
  ADD COLUMN "contact_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "public_sites" AS site
SET "host_description" = host."public_bio",
    "contact_kinds" = CASE WHEN host."socials" = '[]'::jsonb THEN '[]'::jsonb ELSE '["whatsapp"]'::jsonb END
FROM "users" AS host
WHERE host."id" = site."host_user_id" AND host."organization_id" = site."organization_id";
--> statement-breakpoint
CREATE TABLE "pending_email_changes" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "sent_at" timestamptz NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL
);
