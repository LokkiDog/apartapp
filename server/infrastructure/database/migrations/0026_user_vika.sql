ALTER TABLE "users" ADD COLUMN "is_vika" boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_vika_per_organization_unique" ON "users" USING btree ("organization_id") WHERE "users"."is_vika";
