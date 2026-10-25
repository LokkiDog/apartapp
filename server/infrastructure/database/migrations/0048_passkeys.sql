CREATE TABLE "passkeys" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "public_key" text NOT NULL,
  "counter" numeric(20, 0) DEFAULT 0 NOT NULL,
  "transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_used_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" ("user_id");
--> statement-breakpoint
CREATE TABLE "passkey_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purpose" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "browser_hash" text NOT NULL,
  "challenge" text NOT NULL,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "passkey_challenges_expiry_idx" ON "passkey_challenges" ("expires_at");
