CREATE FUNCTION notify_crm_realtime() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  scope text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  ELSE
    row_data := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'notifications' THEN
    IF TG_OP <> 'INSERT' AND OLD.crm_visible THEN
      PERFORM pg_notify('crm_realtime', 'notifications:' || OLD.organization_id || ':' || OLD.user_id);
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.crm_visible THEN
      PERFORM pg_notify('crm_realtime', 'notifications:' || NEW.organization_id || ':' || NEW.user_id);
    END IF;
  ELSE
    scope := row_data->>'organization_id';
    PERFORM pg_notify('crm_realtime', 'messaging:' || scope);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notifications_realtime AFTER INSERT OR UPDATE OR DELETE ON notifications
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime();
--> statement-breakpoint
CREATE TRIGGER messaging_conversations_realtime AFTER INSERT OR UPDATE OR DELETE ON messaging_conversations
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime();
--> statement-breakpoint
CREATE TRIGGER messaging_messages_realtime AFTER INSERT OR UPDATE OR DELETE ON messaging_messages
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime();
--> statement-breakpoint
CREATE TRIGGER messaging_connections_realtime AFTER INSERT OR UPDATE OR DELETE ON messaging_connections
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime();
--> statement-breakpoint
CREATE TRIGGER messaging_contacts_realtime AFTER INSERT OR UPDATE OR DELETE ON messaging_contacts
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime();
--> statement-breakpoint
CREATE TRIGGER messaging_attachments_realtime AFTER INSERT OR UPDATE OR DELETE ON messaging_attachments
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime();
--> statement-breakpoint
CREATE FUNCTION notify_crm_realtime_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('crm_realtime', TG_TABLE_NAME || ':' || OLD.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_realtime_access AFTER DELETE OR UPDATE OF status, roles, is_superuser, organization_id ON users
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime_access();
--> statement-breakpoint
CREATE TRIGGER organizations_realtime_access AFTER DELETE OR UPDATE OF status, messaging_enabled ON organizations
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime_access();
--> statement-breakpoint
CREATE TRIGGER sessions_realtime_access AFTER DELETE OR UPDATE OF revision, organization_id ON platform_sessions
FOR EACH ROW EXECUTE FUNCTION notify_crm_realtime_access();
