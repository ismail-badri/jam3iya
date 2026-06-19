INSERT INTO staff_roles (id, name, description, permissions)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'System Administrator', 'Full association administration access.', ARRAY['*']),
  ('22222222-2222-2222-2222-222222222222', 'Water Operations', 'Operational access for meters, requests, schedules, and reports.', ARRAY['farmers:read','fields:write','meters:write','requests:write','bills:read','notifications:write','reports:read']),
  ('33333333-3333-3333-3333-333333333333', 'Finance Clerk', 'Billing, payment, and reporting access.', ARRAY['farmers:read','bills:write','payments:write','reports:read']);

-- Password hashes are produced by the Node application. Insert users through the app
-- or replace these placeholders with PBKDF2 hashes before using this seed in production.
