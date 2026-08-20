ALTER TABLE "cleaning_assignments" ADD COLUMN "route_position" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "cleaning_assignment_route_idx" ON "cleaning_assignments" USING btree ("cleaner_id", "route_position");
