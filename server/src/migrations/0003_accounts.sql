CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mi cuenta',
  drawdown_mode text NOT NULL DEFAULT 'intraday',
  size_label text,
  initial_balance numeric NOT NULL DEFAULT 50000,
  max_drawdown numeric NOT NULL DEFAULT 2000,
  profit_target numeric NOT NULL DEFAULT 3000,
  max_contracts int NOT NULL DEFAULT 6,
  eval_days int NOT NULL DEFAULT 30,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  current_balance numeric NOT NULL DEFAULT 50000,
  peak_balance numeric NOT NULL DEFAULT 50000,
  risk_per_trade numeric NOT NULL DEFAULT 200,
  daily_stop_limit numeric NOT NULL DEFAULT 600,
  min_rr numeric NOT NULL DEFAULT 2,
  max_trades_per_day int NOT NULL DEFAULT 6,
  default_contracts int NOT NULL DEFAULT 1,
  default_instrument text NOT NULL DEFAULT 'MNQ',
  account_kind text NOT NULL DEFAULT 'Evaluación',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_user ON accounts(user_id);
ALTER TABLE users ADD CONSTRAINT fk_active_account
  FOREIGN KEY (active_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
