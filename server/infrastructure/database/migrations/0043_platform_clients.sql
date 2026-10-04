-- Stop before changing anything when normalized emails collide.
DO $$ DECLARE conflicts text; BEGIN
  SELECT string_agg(email, ', ') INTO conflicts FROM (
    SELECT lower(trim(email)) email FROM users GROUP BY lower(trim(email)) HAVING count(*) > 1
  ) duplicates;
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION 'Resolve duplicate user emails before migration: %', conflicts; END IF;
END $$;
--> statement-breakpoint
UPDATE users SET email = lower(trim(email));
DROP INDEX users_organization_email_unique;
CREATE UNIQUE INDEX users_email_unique ON users (lower(trim(email)));
ALTER TABLE organizations ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked'));
ALTER TABLE users ADD COLUMN is_superuser boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE system_settings (
 id text PRIMARY KEY DEFAULT 'platform' CHECK (id = 'platform'),
 registration_mode text NOT NULL DEFAULT 'superuser_only' CHECK (registration_mode IN ('self_service', 'superuser_only')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_settings (id) VALUES ('platform');
CREATE TABLE platform_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id uuid REFERENCES organizations(id), revision uuid NOT NULL DEFAULT gen_random_uuid(), expires_at timestamptz NOT NULL
);
CREATE TABLE pending_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, company_name text NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 organization_id uuid REFERENCES organizations(id), action text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE registration_attempts (key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL);
