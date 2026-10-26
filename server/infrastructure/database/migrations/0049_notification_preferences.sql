ALTER TABLE notifications ADD COLUMN event_key text;
--> statement-breakpoint
ALTER TABLE notifications ADD COLUMN crm_visible boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE notification_preferences (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key text NOT NULL, crm boolean NOT NULL DEFAULT true, push boolean NOT NULL DEFAULT true, email boolean NOT NULL DEFAULT false,
 PRIMARY KEY (organization_id, user_id, event_key)
);
--> statement-breakpoint
CREATE TABLE notification_email_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid, last_error text
);
--> statement-breakpoint
CREATE UNIQUE INDEX notification_email_unique_idx ON notification_email_queue(notification_id);
--> statement-breakpoint
CREATE INDEX notification_email_pending_idx ON notification_email_queue(status, available_at);
