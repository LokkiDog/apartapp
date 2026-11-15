ALTER TABLE organizations ADD COLUMN ai_agents_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE ai_agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  permissions text[] NOT NULL,
  resource text NOT NULL,
  access_hash text NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_hash text NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX ai_agent_connection_owner_idx ON ai_agent_connections (organization_id, user_id, client_id);
--> statement-breakpoint
CREATE TABLE ai_agent_codes (
  hash text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  permissions text[] NOT NULL,
  challenge text NOT NULL,
  redirect_uri text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_agent_codes_expiry_idx ON ai_agent_codes (expires_at);
