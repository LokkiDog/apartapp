CREATE TABLE "system_notification_email_preferences" (
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "category" text NOT NULL CONSTRAINT "system_notification_email_category_check" CHECK ("category" IN ('setup', 'registration', 'invitationFailure')),
  "enabled" boolean NOT NULL,
  PRIMARY KEY ("user_id", "category")
);
--> statement-breakpoint
CREATE INDEX "notification_system_user_created_idx"
  ON "notifications" ("user_id", "created_at" DESC, "id" DESC)
  WHERE NOT "crm_visible";
