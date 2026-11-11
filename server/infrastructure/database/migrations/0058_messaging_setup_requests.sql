ALTER TABLE "notifications"
  ADD COLUMN "source_organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "notification_source_organization_idx"
  ON "notifications" ("source_organization_id", "event_key")
  WHERE "source_organization_id" IS NOT NULL;
