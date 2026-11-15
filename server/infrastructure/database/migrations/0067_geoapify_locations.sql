ALTER TABLE hotels ADD COLUMN address_attribution text;
--> statement-breakpoint
CREATE TABLE geoapify_daily_usage (
  day date PRIMARY KEY,
  requests integer NOT NULL CHECK (requests > 0),
  last_request_at timestamptz NOT NULL
);
