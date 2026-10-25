UPDATE "system_settings"
SET "registration_mode" = 'superuser_only', "updated_at" = now()
WHERE "id" = 'platform';
