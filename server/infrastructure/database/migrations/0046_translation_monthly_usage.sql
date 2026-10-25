CREATE TABLE "translation_monthly_usage" (
  "month" text PRIMARY KEY NOT NULL,
  "characters" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "translation_monthly_usage_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "translation_monthly_usage_nonnegative" CHECK ("characters" >= 0)
);
