ALTER TABLE "apartment_types" ADD COLUMN "default_linen_guest_count" integer DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE "apartment_types" ADD CONSTRAINT "apartment_type_default_linen_guest_count" CHECK ("default_linen_guest_count" >= 1 AND "default_linen_guest_count" <= 50);
--> statement-breakpoint
ALTER TABLE "cleaning_problems" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
CREATE TABLE "cleaning_guest_preparations" (
	"cleaning_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" text NOT NULL,
	"stay_id" uuid,
	"check_in_on" date,
	"adult_count" integer,
	"child_count" integer,
	"guest_count" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cleaning_guest_preparation_source" CHECK ("source" IN ('booking', 'type_default')),
	CONSTRAINT "cleaning_guest_preparation_guest_count" CHECK ("guest_count" >= 1 AND "guest_count" <= 50),
	CONSTRAINT "cleaning_guest_preparations_cleaning_id_cleanings_id_fk" FOREIGN KEY ("cleaning_id") REFERENCES "public"."cleanings"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "cleaning_guest_preparations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "cleaning_guest_preparation_organization_idx" ON "cleaning_guest_preparations" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "cleaning_problem_guest_count_change_unique" ON "cleaning_problems" USING btree ("cleaning_id") WHERE "origin" = 'guest_count_change';
