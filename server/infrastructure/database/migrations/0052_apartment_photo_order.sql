ALTER TABLE attachments ADD COLUMN position integer NOT NULL DEFAULT 0;
--> statement-breakpoint
WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, entity_id ORDER BY created_at, id
  ) - 1 AS position FROM attachments WHERE entity_type = 'apartment'
)
UPDATE attachments SET position = ordered.position FROM ordered WHERE attachments.id = ordered.id;
--> statement-breakpoint
CREATE INDEX attachment_apartment_photo_order_idx ON attachments (organization_id, entity_type, entity_id, position, created_at, id);
