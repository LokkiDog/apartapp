ALTER TABLE messaging_connections ADD COLUMN verification_pending boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX messaging_channel_bot_idx ON messaging_connections(channel, bot_id);
--> statement-breakpoint
ALTER TABLE messaging_connections DROP CONSTRAINT messaging_connections_bot_id_key;
