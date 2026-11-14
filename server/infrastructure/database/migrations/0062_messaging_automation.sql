ALTER TABLE "organizations" ADD COLUMN "messaging_automation" jsonb;
--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD COLUMN "last_away_period" text;
--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD COLUMN "automated" boolean DEFAULT false NOT NULL;
