ALTER TYPE "user_status" ADD VALUE IF NOT EXISTS 'archived';

ALTER TABLE "apartments" ALTER COLUMN "manager_id" DROP NOT NULL;
ALTER TABLE "financial_entries" ALTER COLUMN "manager_id" DROP NOT NULL;

ALTER TABLE "apartments" DROP CONSTRAINT IF EXISTS "apartments_manager_id_users_id_fk";
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "financial_entries" DROP CONSTRAINT IF EXISTS "financial_entries_manager_id_users_id_fk";
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_id_users_id_fk";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
