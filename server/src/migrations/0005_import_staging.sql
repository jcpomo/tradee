CREATE TABLE import_staging (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
