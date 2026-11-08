ALTER TABLE organizations ADD COLUMN messaging_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN messaging_enabled_since timestamptz;
CREATE TABLE messaging_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 channel text NOT NULL DEFAULT 'telegram', bot_id text NOT NULL UNIQUE, bot_name text NOT NULL, bot_username text NOT NULL,
 encrypted_token text NOT NULL, webhook_secret text NOT NULL, connected boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messaging_org_channel_idx ON messaging_connections(organization_id, channel);
CREATE TABLE messaging_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 connection_id uuid NOT NULL REFERENCES messaging_connections(id), external_id text NOT NULL, name text NOT NULL, username text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messaging_contact_external_idx ON messaging_contacts(connection_id, external_id);
CREATE TABLE messaging_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 connection_id uuid NOT NULL REFERENCES messaging_connections(id), contact_id uuid NOT NULL REFERENCES messaging_contacts(id),
 stay_id uuid REFERENCES stays(id) ON DELETE SET NULL, unread integer NOT NULL DEFAULT 0,
 last_message_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messaging_conversation_contact_idx ON messaging_conversations(contact_id);
CREATE INDEX messaging_conversation_org_idx ON messaging_conversations(organization_id, last_message_at);
CREATE TABLE messaging_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 conversation_id uuid NOT NULL REFERENCES messaging_conversations(id), direction text NOT NULL, text text NOT NULL DEFAULT '',
 status text NOT NULL, unsupported boolean NOT NULL DEFAULT false, external_id text, request_id uuid, sent_at timestamptz, author_id uuid REFERENCES users(id) ON DELETE SET NULL, author_name text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messaging_message_request_idx ON messaging_messages(organization_id, request_id);
CREATE UNIQUE INDEX messaging_message_external_idx ON messaging_messages(conversation_id, direction, external_id);
CREATE INDEX messaging_message_history_idx ON messaging_messages(conversation_id, created_at, id);
CREATE TABLE messaging_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 message_id uuid NOT NULL REFERENCES messaging_messages(id), name text NOT NULL, mime_type text NOT NULL, size integer NOT NULL,
 external_file_id text, storage_key text, available boolean NOT NULL DEFAULT true
);
CREATE TABLE messaging_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 message_id uuid NOT NULL UNIQUE REFERENCES messaging_messages(id), attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid
);
CREATE INDEX messaging_outbox_pending_idx ON messaging_outbox(available_at);
CREATE TABLE messaging_updates (
 connection_id uuid NOT NULL REFERENCES messaging_connections(id), update_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id, update_id)
);
