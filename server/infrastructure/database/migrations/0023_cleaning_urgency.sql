ALTER TABLE "cleanings" ADD COLUMN "is_urgent" boolean DEFAULT false NOT NULL;
ALTER TABLE "cleanings" ADD COLUMN "urgency_override" boolean;
