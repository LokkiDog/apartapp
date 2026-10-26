CREATE TABLE apartment_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 apartment_id uuid NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
 published boolean NOT NULL DEFAULT false,
 slug text NOT NULL,
 sort_order integer NOT NULL DEFAULT 0,
 translations jsonb NOT NULL,
 amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX apartment_publication_apartment ON apartment_publications(apartment_id);
CREATE UNIQUE INDEX apartment_publication_slug ON apartment_publications(organization_id, slug);
CREATE TABLE apartment_publication_photos (
 publication_id uuid NOT NULL REFERENCES apartment_publications(id) ON DELETE CASCADE,
 attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
 position integer NOT NULL,
 PRIMARY KEY (publication_id, attachment_id)
);
-- Revoking the last selected image also revokes the publication, including direct SQL deletes.
CREATE FUNCTION unpublish_empty_apartment_gallery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE apartment_publications SET published = false, updated_at = now()
 WHERE id = OLD.publication_id AND NOT EXISTS (
   SELECT 1 FROM apartment_publication_photos WHERE publication_id = OLD.publication_id
 );
 RETURN OLD;
END;
$$;
CREATE TRIGGER apartment_gallery_deleted AFTER DELETE ON apartment_publication_photos
 FOR EACH ROW EXECUTE FUNCTION unpublish_empty_apartment_gallery();

CREATE TRIGGER apartment_publications_client_scope BEFORE INSERT OR UPDATE ON apartment_publications
 FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments');
CREATE TRIGGER apartment_publication_photos_client_scope BEFORE INSERT OR UPDATE ON apartment_publication_photos
 FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('publication_id:apartment_publications', 'attachment_id:attachments');

CREATE FUNCTION unpublish_inactive_apartment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status <> 'active' THEN
   UPDATE apartment_publications SET published = false, updated_at = now() WHERE apartment_id = NEW.id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER apartment_publication_status AFTER UPDATE OF status ON apartments
 FOR EACH ROW EXECUTE FUNCTION unpublish_inactive_apartment();
