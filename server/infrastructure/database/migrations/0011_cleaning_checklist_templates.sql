ALTER TABLE "apartment_types" ADD COLUMN "default_checklist" jsonb DEFAULT '["Сменить белье и полотенца", "Проверить санузел и кухню", "Проверить расходники"]'::jsonb NOT NULL;
