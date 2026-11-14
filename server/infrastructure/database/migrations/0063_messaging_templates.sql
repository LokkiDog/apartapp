CREATE TABLE "messaging_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "text" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "messaging_template_org_idx" ON "messaging_templates" ("organization_id", "name", "id");
