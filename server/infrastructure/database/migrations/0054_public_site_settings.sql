ALTER TABLE users ADD COLUMN profile_photo_key text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN public_bio jsonb NOT NULL DEFAULT '{"ru":"","en":"","he":"","bg":""}'::jsonb;
--> statement-breakpoint
CREATE TABLE public_sites (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 website_url text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 host_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX public_sites_url_unique ON public_sites(website_url);
