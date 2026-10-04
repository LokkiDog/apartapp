-- Enforce tenant consistency for operational relationships, including child
-- tables that inherit their tenant through a parent. Authorship is allowed
-- across tenants for audited support actions by a platform superuser.
CREATE FUNCTION aparts_row_organization(table_name text, row_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE row_data jsonb; parent_name text; parent_id uuid;
BEGIN
  IF row_id IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', table_name) INTO row_data USING row_id;
  IF row_data IS NULL THEN RETURN NULL; END IF;
  IF row_data ? 'organization_id' THEN RETURN (row_data->>'organization_id')::uuid; END IF;
  CASE table_name
    WHEN 'inventory_movements', 'inventory_lots', 'apartment_consumables' THEN parent_name := 'apartments'; parent_id := (row_data->>'apartment_id')::uuid;
    WHEN 'stay_services' THEN parent_name := 'stays'; parent_id := (row_data->>'stay_id')::uuid;
    WHEN 'manager_expense_report_lines' THEN parent_name := 'manager_expense_reports'; parent_id := (row_data->>'report_id')::uuid;
    ELSE RETURN NULL;
  END CASE;
  RETURN aparts_row_organization(parent_name, parent_id);
END $$;
--> statement-breakpoint
CREATE FUNCTION aparts_check_client_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE row_data jsonb := to_jsonb(NEW); expected uuid := (row_data->>'organization_id')::uuid;
  related uuid; field_name text; parent_name text; value uuid; arg text; superuser boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD)->>'organization_id' IS DISTINCT FROM row_data->>'organization_id' THEN
    RAISE EXCEPTION 'Moving operational data between clients is forbidden' USING ERRCODE = '23514';
  END IF;
  FOREACH arg IN ARRAY coalesce(TG_ARGV, ARRAY[]::text[]) LOOP
    field_name := split_part(arg, ':', 1); parent_name := split_part(arg, ':', 2);
    -- Authorship and snapshot sources remain historical facts after role
    -- revocation or deletion of the source work. Validate when first set.
    IF TG_OP = 'UPDATE' AND to_jsonb(OLD)->>field_name IS NOT DISTINCT FROM row_data->>field_name
       AND (field_name LIKE '%\_by\_id' ESCAPE '\' OR field_name = 'actor_id'
         OR (TG_TABLE_NAME = 'cleaning_problems' AND field_name = 'source_task_id')
         OR (TG_TABLE_NAME = 'cleaning_guest_preparations' AND field_name = 'stay_id')) THEN CONTINUE; END IF;
    value := (row_data->>field_name)::uuid;
    IF value IS NULL THEN CONTINUE; END IF;
    related := aparts_row_organization(parent_name, value);
    IF related IS NULL THEN RAISE EXCEPTION 'Invalid tenant reference %.%', TG_TABLE_NAME, field_name USING ERRCODE = '23514'; END IF;
    IF expected IS NULL THEN expected := related; END IF;
    IF parent_name = 'users' AND (field_name LIKE '%\_by\_id' ESCAPE '\' OR field_name = 'actor_id') THEN
      SELECT is_superuser INTO superuser FROM users WHERE id = value;
      IF superuser THEN CONTINUE; END IF;
    END IF;
    IF expected IS DISTINCT FROM related THEN
      RAISE EXCEPTION 'Cross-client reference %.%', TG_TABLE_NAME, field_name USING ERRCODE = '23514';
    END IF;
    IF parent_name = 'users' AND field_name IN ('cleaner_id', 'assignee_id') THEN
      SELECT is_superuser INTO superuser FROM users WHERE id = value;
      IF superuser THEN RAISE EXCEPTION 'Superusers cannot be assigned operational work' USING ERRCODE = '23514'; END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER apartments_client_scope BEFORE INSERT OR UPDATE ON apartments FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('hotel_id:hotels', 'apartment_type_id:apartment_types');
CREATE TRIGGER apartment_managers_client_scope BEFORE INSERT OR UPDATE ON apartment_managers FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'user_id:users');
CREATE TRIGGER stays_client_scope BEFORE INSERT OR UPDATE ON stays FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'ical_feed_id:ical_feeds', 'created_by_id:users');
CREATE TRIGGER ical_feeds_client_scope BEFORE INSERT OR UPDATE ON ical_feeds FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'created_by_id:users');
CREATE TRIGGER ical_conflicts_client_scope BEFORE INSERT OR UPDATE ON ical_conflicts FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'imported_stay_id:stays', 'existing_stay_id:stays', 'resolved_by_id:users');
CREATE TRIGGER stay_services_client_scope BEFORE INSERT OR UPDATE ON stay_services FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('stay_id:stays', 'special_service_id:special_services');
CREATE TRIGGER cleanings_client_scope BEFORE INSERT OR UPDATE ON cleanings FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'stay_id:stays');
CREATE TRIGGER cleaning_assignments_client_scope BEFORE INSERT OR UPDATE ON cleaning_assignments FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('cleaning_id:cleanings', 'cleaner_id:users');
CREATE TRIGGER cleaning_problems_client_scope BEFORE INSERT OR UPDATE ON cleaning_problems FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'cleaning_id:cleanings', 'source_task_id:tasks', 'created_by_id:users', 'resolved_by_id:users', 'deletion_requested_by_id:users');
CREATE TRIGGER cleaning_guest_preparations_client_scope BEFORE INSERT OR UPDATE ON cleaning_guest_preparations FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('cleaning_id:cleanings', 'stay_id:stays');
CREATE TRIGGER tasks_client_scope BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'assignee_id:users', 'problem_id:cleaning_problems', 'created_by_id:users');
CREATE TRIGGER cash_task_details_client_scope BEFORE INSERT OR UPDATE ON cash_task_details FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('task_id:tasks', 'stay_id:stays', 'cleaning_id:cleanings', 'collected_by_id:users', 'received_by_id:users');
CREATE TRIGGER apartment_type_consumable_write_offs_client_scope BEFORE INSERT OR UPDATE ON apartment_type_consumable_write_offs FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_type_id:apartment_types', 'consumable_id:consumables');
CREATE TRIGGER apartment_consumables_client_scope BEFORE INSERT OR UPDATE ON apartment_consumables FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'consumable_id:consumables');
CREATE TRIGGER inventory_lots_client_scope BEFORE INSERT OR UPDATE ON inventory_lots FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'consumable_id:consumables');
CREATE TRIGGER inventory_movements_client_scope BEFORE INSERT OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'consumable_id:consumables', 'created_by_id:users');
CREATE TRIGGER cleaning_inventory_reports_client_scope BEFORE INSERT OR UPDATE ON cleaning_inventory_reports FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('cleaning_id:cleanings', 'consumable_id:consumables', 'reported_by_id:users', 'approved_by_id:users');
CREATE TRIGGER financial_entries_client_scope BEFORE INSERT OR UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'problem_id:cleaning_problems', 'created_by_id:users');
CREATE TRIGGER notifications_client_scope BEFORE INSERT OR UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('user_id:users');
CREATE TRIGGER manager_expense_reports_client_scope BEFORE INSERT OR UPDATE ON manager_expense_reports FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('apartment_id:apartments', 'published_by_id:users');
CREATE TRIGGER manager_expense_report_lines_client_scope BEFORE INSERT OR UPDATE ON manager_expense_report_lines FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('report_id:manager_expense_reports', 'problem_id:cleaning_problems');
CREATE TRIGGER audit_logs_client_scope BEFORE INSERT OR UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('actor_id:users');
CREATE TRIGGER attachments_client_scope BEFORE INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope('uploaded_by_id:users');
CREATE TRIGGER users_client_scope BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope();
CREATE TRIGGER hotels_client_scope BEFORE UPDATE ON hotels FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope();
CREATE TRIGGER apartment_types_client_scope BEFORE UPDATE ON apartment_types FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope();
CREATE TRIGGER special_services_client_scope BEFORE UPDATE ON special_services FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope();
CREATE TRIGGER consumables_client_scope BEFORE UPDATE ON consumables FOR EACH ROW EXECUTE FUNCTION aparts_check_client_scope();
