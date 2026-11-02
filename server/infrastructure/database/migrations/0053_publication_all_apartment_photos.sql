-- Public galleries now follow all apartment photos, rather than a selected subset.
DROP TRIGGER apartment_gallery_deleted ON apartment_publication_photos;
--> statement-breakpoint
DROP FUNCTION unpublish_empty_apartment_gallery();
--> statement-breakpoint
CREATE FUNCTION unpublish_empty_apartment_photos() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.entity_type = 'apartment' THEN
   UPDATE apartment_publications SET published = false, updated_at = now()
   WHERE apartment_id = OLD.entity_id AND organization_id = OLD.organization_id AND NOT EXISTS (
     SELECT 1 FROM attachments WHERE entity_type = 'apartment'
       AND entity_id = OLD.entity_id AND organization_id = OLD.organization_id
   );
 END IF;
 RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER apartment_photos_deleted AFTER DELETE ON attachments
 FOR EACH ROW EXECUTE FUNCTION unpublish_empty_apartment_photos();
