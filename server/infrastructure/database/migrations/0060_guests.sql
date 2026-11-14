CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  phone_key text,
  email text NOT NULL DEFAULT '',
  email_key text,
  whatsapp text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX guests_org_name_idx ON guests (organization_id, name, id);
--> statement-breakpoint
CREATE UNIQUE INDEX guests_org_phone_idx ON guests (organization_id, phone_key);
--> statement-breakpoint
CREATE UNIQUE INDEX guests_org_email_idx ON guests (organization_id, email_key);
--> statement-breakpoint
ALTER TABLE stays
  ADD COLUMN guest_id uuid REFERENCES guests(id),
  ADD COLUMN guest_email text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX stays_guest_idx ON stays (guest_id, organization_id, check_in_on);
--> statement-breakpoint
ALTER TABLE messaging_contacts ADD COLUMN guest_id uuid REFERENCES guests(id);
--> statement-breakpoint
CREATE INDEX messaging_contacts_guest_idx ON messaging_contacts (guest_id, organization_id);
