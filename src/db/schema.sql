-- Hayloft schema (Postgres)
-- Every table mirrors a Harvest API resource. Each row also stores the raw
-- JSON response in raw_json as a future-proof escape hatch.

-- Trigram extension for fuzzy/partial text search if we want it later.
-- tsvector + GIN is our primary FTS approach (see search_index at the bottom).

-- ─── Sync bookkeeping ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_state (
  resource          TEXT PRIMARY KEY,
  last_synced_at    TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  total_records     INTEGER DEFAULT 0,
  last_error        TEXT,
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id               SERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  resource         TEXT,
  mode             TEXT,
  records_seen     INTEGER DEFAULT 0,
  records_written  INTEGER DEFAULT 0,
  status           TEXT,
  error            TEXT
);

-- ─── Company ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company (
  id                      BIGINT PRIMARY KEY,
  base_uri                TEXT,
  full_domain             TEXT,
  name                    TEXT,
  is_active               BOOLEAN,
  week_start_day          TEXT,
  wants_timestamp_timers  BOOLEAN,
  time_format             TEXT,
  plan_type               TEXT,
  clock                   TEXT,
  decimal_symbol          TEXT,
  thousands_separator     TEXT,
  color_scheme            TEXT,
  weekly_capacity         INTEGER,
  expense_feature         BOOLEAN,
  invoice_feature         BOOLEAN,
  estimate_feature        BOOLEAN,
  approval_feature        BOOLEAN,
  raw_json                JSONB
);

-- ─── Users / Teammates / Roles ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                                  BIGINT PRIMARY KEY,
  first_name                          TEXT,
  last_name                           TEXT,
  email                               TEXT,
  telephone                           TEXT,
  timezone                            TEXT,
  has_access_to_all_future_projects   BOOLEAN,
  is_contractor                       BOOLEAN,
  is_active                           BOOLEAN,
  weekly_capacity                     INTEGER,
  default_hourly_rate                 NUMERIC,
  cost_rate                           NUMERIC,
  roles                               JSONB,
  access_roles                        JSONB,
  avatar_url                          TEXT,
  calendar_integration_enabled        BOOLEAN,
  calendar_integration_source         TEXT,
  can_create_projects                 BOOLEAN,
  created_at                          TIMESTAMPTZ,
  updated_at                          TIMESTAMPTZ,
  raw_json                            JSONB
);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_name ON users(last_name, first_name);

CREATE TABLE IF NOT EXISTS user_teammates (
  user_id      BIGINT NOT NULL,
  teammate_id  BIGINT NOT NULL,
  raw_json     JSONB,
  PRIMARY KEY (user_id, teammate_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id          BIGINT PRIMARY KEY,
  name        TEXT,
  user_ids    JSONB,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  raw_json    JSONB
);

-- ─── Clients & Contacts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id             BIGINT PRIMARY KEY,
  name           TEXT,
  is_active      BOOLEAN,
  address        TEXT,
  statement_key  TEXT,
  currency       TEXT,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ,
  raw_json       JSONB
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);

CREATE TABLE IF NOT EXISTS client_contacts (
  id            BIGINT PRIMARY KEY,
  client_id     BIGINT,
  title         TEXT,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  phone_office  TEXT,
  phone_mobile  TEXT,
  fax           TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  raw_json      JSONB
);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);

-- ─── Projects ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                                    BIGINT PRIMARY KEY,
  client_id                             BIGINT,
  name                                  TEXT,
  code                                  TEXT,
  is_active                             BOOLEAN,
  is_billable                           BOOLEAN,
  is_fixed_fee                          BOOLEAN,
  bill_by                               TEXT,
  hourly_rate                           NUMERIC,
  budget                                NUMERIC,
  budget_by                             TEXT,
  budget_is_monthly                     BOOLEAN,
  notify_when_over_budget               BOOLEAN,
  over_budget_notification_percentage   NUMERIC,
  show_budget_to_all                    BOOLEAN,
  cost_budget                           NUMERIC,
  cost_budget_include_expenses          BOOLEAN,
  fee                                   NUMERIC,
  notes                                 TEXT,
  starts_on                             DATE,
  ends_on                               DATE,
  over_budget_notification_date         DATE,
  created_at                            TIMESTAMPTZ,
  updated_at                            TIMESTAMPTZ,
  raw_json                              JSONB
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

-- ─── Tasks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                     BIGINT PRIMARY KEY,
  name                   TEXT,
  billable_by_default    BOOLEAN,
  default_hourly_rate    NUMERIC,
  is_default             BOOLEAN,
  is_active              BOOLEAN,
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ,
  raw_json               JSONB
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id           BIGINT PRIMARY KEY,
  project_id   BIGINT,
  task_id      BIGINT,
  is_active    BOOLEAN,
  billable     BOOLEAN,
  hourly_rate  NUMERIC,
  budget       NUMERIC,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ,
  raw_json     JSONB
);
CREATE INDEX IF NOT EXISTS idx_task_assignments_project ON task_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);

CREATE TABLE IF NOT EXISTS user_assignments (
  id                  BIGINT PRIMARY KEY,
  project_id          BIGINT,
  user_id             BIGINT,
  is_active           BOOLEAN,
  is_project_manager  BOOLEAN,
  use_default_rates   BOOLEAN,
  hourly_rate         NUMERIC,
  budget              NUMERIC,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ,
  raw_json            JSONB
);
CREATE INDEX IF NOT EXISTS idx_user_assignments_project ON user_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_user_assignments_user ON user_assignments(user_id);

-- ─── Time Entries ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id                   BIGINT PRIMARY KEY,
  spent_date           DATE,
  user_id              BIGINT,
  client_id            BIGINT,
  project_id           BIGINT,
  task_id              BIGINT,
  invoice_id           BIGINT,
  hours                NUMERIC,
  hours_without_timer  NUMERIC,
  rounded_hours        NUMERIC,
  notes                TEXT,
  is_locked            BOOLEAN,
  locked_reason        TEXT,
  is_closed            BOOLEAN,
  is_billed            BOOLEAN,
  timer_started_at     TIMESTAMPTZ,
  started_time         TEXT,
  ended_time           TEXT,
  is_running           BOOLEAN,
  billable             BOOLEAN,
  budgeted             BOOLEAN,
  billable_rate        NUMERIC,
  cost_rate            NUMERIC,
  external_reference   JSONB,
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ,
  raw_json             JSONB
);
CREATE INDEX IF NOT EXISTS idx_time_entries_date     ON time_entries(spent_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_user     ON time_entries(user_id, spent_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project  ON time_entries(project_id, spent_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_client   ON time_entries(client_id, spent_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_task     ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_invoice  ON time_entries(invoice_id);

-- ─── Invoices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_item_categories (
  id              BIGINT PRIMARY KEY,
  name            TEXT,
  use_as_service  BOOLEAN,
  use_as_expense  BOOLEAN,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  raw_json        JSONB
);

CREATE TABLE IF NOT EXISTS invoices (
  id                    BIGINT PRIMARY KEY,
  client_id             BIGINT,
  retainer_id           BIGINT,
  estimate_id           BIGINT,
  recurring_invoice_id  BIGINT,
  number                TEXT,
  purchase_order        TEXT,
  amount                NUMERIC,
  due_amount            NUMERIC,
  tax                   NUMERIC,
  tax_amount            NUMERIC,
  tax2                  NUMERIC,
  tax2_amount           NUMERIC,
  discount              NUMERIC,
  discount_amount       NUMERIC,
  subject               TEXT,
  notes                 TEXT,
  currency              TEXT,
  state                 TEXT,
  period_start          DATE,
  period_end            DATE,
  issue_date            DATE,
  due_date              DATE,
  payment_term          TEXT,
  payment_options       JSONB,
  sent_at               TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  paid_date             DATE,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ,
  raw_json              JSONB
);
CREATE INDEX IF NOT EXISTS idx_invoices_client      ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_state       ON invoices(state);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date  ON invoices(issue_date);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id          BIGINT PRIMARY KEY,
  invoice_id  BIGINT,
  project_id  BIGINT,
  kind        TEXT,
  description TEXT,
  quantity    NUMERIC,
  unit_price  NUMERIC,
  amount      NUMERIC,
  taxed       BOOLEAN,
  taxed2      BOOLEAN,
  raw_json    JSONB
);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id                BIGINT PRIMARY KEY,
  invoice_id        BIGINT,
  amount            NUMERIC,
  paid_at           TIMESTAMPTZ,
  paid_date         DATE,
  recorded_by       TEXT,
  recorded_by_email TEXT,
  notes             TEXT,
  transaction_id    TEXT,
  payment_gateway   TEXT,
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ,
  raw_json          JSONB
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_messages (
  id                              BIGINT PRIMARY KEY,
  invoice_id                      BIGINT,
  sent_by                         TEXT,
  sent_by_email                   TEXT,
  sent_from                       TEXT,
  sent_from_email                 TEXT,
  recipients                      TEXT,
  subject                         TEXT,
  body                            TEXT,
  include_link_to_client_invoice  BOOLEAN,
  attach_pdf                      BOOLEAN,
  send_me_a_copy                  BOOLEAN,
  thank_you                       BOOLEAN,
  reminder                        BOOLEAN,
  event_type                      TEXT,
  sent_at                         TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ,
  updated_at                      TIMESTAMPTZ,
  raw_json                        JSONB
);
CREATE INDEX IF NOT EXISTS idx_invoice_messages_invoice ON invoice_messages(invoice_id);

-- ─── Estimates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_item_categories (
  id          BIGINT PRIMARY KEY,
  name        TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  raw_json    JSONB
);

CREATE TABLE IF NOT EXISTS estimates (
  id              BIGINT PRIMARY KEY,
  client_id       BIGINT,
  number          TEXT,
  purchase_order  TEXT,
  amount          NUMERIC,
  tax             NUMERIC,
  tax_amount      NUMERIC,
  tax2            NUMERIC,
  tax2_amount     NUMERIC,
  discount        NUMERIC,
  discount_amount NUMERIC,
  subject         TEXT,
  notes           TEXT,
  currency        TEXT,
  state           TEXT,
  issue_date      DATE,
  sent_at         TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  declined_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  raw_json        JSONB
);
CREATE INDEX IF NOT EXISTS idx_estimates_client ON estimates(client_id);
CREATE INDEX IF NOT EXISTS idx_estimates_state  ON estimates(state);

CREATE TABLE IF NOT EXISTS estimate_line_items (
  id           BIGINT PRIMARY KEY,
  estimate_id  BIGINT,
  kind         TEXT,
  description  TEXT,
  quantity     NUMERIC,
  unit_price   NUMERIC,
  amount       NUMERIC,
  taxed        BOOLEAN,
  taxed2       BOOLEAN,
  raw_json     JSONB
);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate ON estimate_line_items(estimate_id);

CREATE TABLE IF NOT EXISTS estimate_messages (
  id               BIGINT PRIMARY KEY,
  estimate_id      BIGINT,
  sent_by          TEXT,
  sent_by_email    TEXT,
  sent_from        TEXT,
  sent_from_email  TEXT,
  recipients       TEXT,
  subject          TEXT,
  body             TEXT,
  send_me_a_copy   BOOLEAN,
  event_type       TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  raw_json         JSONB
);
CREATE INDEX IF NOT EXISTS idx_estimate_messages_estimate ON estimate_messages(estimate_id);

-- ─── Expenses ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          BIGINT PRIMARY KEY,
  name        TEXT,
  unit_name   TEXT,
  unit_price  NUMERIC,
  is_active   BOOLEAN,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  raw_json    JSONB
);

CREATE TABLE IF NOT EXISTS expenses (
  id                    BIGINT PRIMARY KEY,
  spent_date            DATE,
  user_id               BIGINT,
  user_assignment_id    BIGINT,
  client_id             BIGINT,
  project_id            BIGINT,
  expense_category_id   BIGINT,
  invoice_id            BIGINT,
  notes                 TEXT,
  units                 NUMERIC,
  total_cost            NUMERIC,
  billable              BOOLEAN,
  is_closed             BOOLEAN,
  is_locked             BOOLEAN,
  is_billed             BOOLEAN,
  locked_reason         TEXT,
  -- Receipt metadata as reported by Harvest. The file itself lives in
  -- expense_receipts (fetched separately by the expense_receipts resource).
  receipt               JSONB,
  receipt_url           TEXT,
  receipt_file_name     TEXT,
  receipt_file_size     BIGINT,
  receipt_content_type  TEXT,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ,
  raw_json              JSONB
);
CREATE INDEX IF NOT EXISTS idx_expenses_date      ON expenses(spent_date);
CREATE INDEX IF NOT EXISTS idx_expenses_user      ON expenses(user_id, spent_date);
CREATE INDEX IF NOT EXISTS idx_expenses_project   ON expenses(project_id, spent_date);
CREATE INDEX IF NOT EXISTS idx_expenses_client    ON expenses(client_id, spent_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category  ON expenses(expense_category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_invoice   ON expenses(invoice_id);

-- Receipt files, stored in Postgres so pg_dump still captures the whole
-- archive (Railway's filesystem is ephemeral). Kept in a separate table so
-- expense list queries never drag the bytes along.
CREATE TABLE IF NOT EXISTS expense_receipts (
  expense_id    BIGINT PRIMARY KEY,
  url           TEXT,
  file_name     TEXT,
  content_type  TEXT,
  file_size     BIGINT,
  data          BYTEA,
  fetched_at    TIMESTAMPTZ,
  fetch_error   TEXT
);

-- ─── Full-text search ────────────────────────────────────────────────
-- Unified search index. tsvector generated as a stored column with weighted
-- A/B/C across title/subtitle/body for ranked results.
CREATE TABLE IF NOT EXISTS search_index (
  kind       TEXT NOT NULL,
  ref_id     BIGINT NOT NULL,
  title      TEXT,
  subtitle   TEXT,
  body       TEXT,
  tsv        tsvector GENERATED ALWAYS AS (
               setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
               setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
               setweight(to_tsvector('english', coalesce(body, '')), 'C')
             ) STORED,
  PRIMARY KEY (kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_search_tsv ON search_index USING GIN (tsv);
