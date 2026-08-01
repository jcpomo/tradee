CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text,
  row_count int NOT NULL DEFAULT 0,
  trade_count int NOT NULL DEFAULT 0,
  inserted_count int NOT NULL DEFAULT 0,
  duplicate_count int NOT NULL DEFAULT 0,
  net_pnl numeric NOT NULL DEFAULT 0,
  date_from date, date_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  time text,
  instrument text NOT NULL,
  direction text NOT NULL,
  contracts int NOT NULL DEFAULT 1,
  result text NOT NULL,
  pnl numeric NOT NULL DEFAULT 0,
  points numeric,
  strategy text DEFAULT '',
  notes text DEFAULT '',
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_trade_external ON trades(account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_trades_account_date ON trades(account_id, date);
CREATE TABLE daily_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  open numeric, close numeric NOT NULL, note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, date)
);
