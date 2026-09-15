CREATE INDEX "cleaning_operational_list_idx" ON "cleanings" USING btree ("organization_id", "status", "scheduled_on");
CREATE INDEX "task_operational_list_idx" ON "tasks" USING btree ("organization_id", "status", "due_on");
CREATE INDEX "task_assignee_operational_list_idx" ON "tasks" USING btree ("organization_id", "assignee_id", "status", "due_on");
CREATE INDEX "notification_user_created_idx" ON "notifications" USING btree ("organization_id", "user_id", "created_at");
