ALTER TYPE "financial_entry_type" ADD VALUE IF NOT EXISTS 'manual_expense';
ALTER TYPE "manager_expense_category" ADD VALUE IF NOT EXISTS 'other';

ALTER TABLE "manager_expense_reports" ADD COLUMN IF NOT EXISTS "other_enabled" boolean NOT NULL DEFAULT true;
