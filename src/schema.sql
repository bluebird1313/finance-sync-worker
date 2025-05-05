CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS qbo_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_subtype TEXT,
  fully_qualified_name TEXT,
  active BOOLEAN DEFAULT TRUE,
  current_balance NUMERIC,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS qbo_journal_entries (
  id TEXT PRIMARY KEY,
  txn_date DATE NOT NULL,
  doc_number TEXT,
  private_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS qbo_journal_entry_lines (
  journal_entry_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  posting_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (journal_entry_id, line_id),
  FOREIGN KEY (journal_entry_id) REFERENCES qbo_journal_entries(id),
  FOREIGN KEY (account_id) REFERENCES qbo_accounts(id)
);

CREATE TABLE IF NOT EXISTS plaid_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mask TEXT,
  official_name TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  current_balance NUMERIC,
  available_balance NUMERIC,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS plaid_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  payment_channel TEXT,
  pending BOOLEAN DEFAULT FALSE,
  category TEXT[],
  category_id TEXT,
  personal_finance_category TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (account_id) REFERENCES plaid_accounts(id)
);

CREATE TABLE IF NOT EXISTS monthly_pl (
  month DATE PRIMARY KEY,
  revenue NUMERIC NOT NULL DEFAULT 0,
  expenses NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_anomalies (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS financial_embeddings (
  id SERIAL PRIMARY KEY,
  content_type TEXT NOT NULL, -- 'account', 'transaction', 'journal_entry', etc.
  content_id TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding vector(1536), -- OpenAI embedding dimension
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS financial_embeddings_embedding_idx ON financial_embeddings USING ivfflat (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION generate_monthly_pl_view()
RETURNS VOID AS $$
BEGIN
  DELETE FROM monthly_pl;
  
  INSERT INTO monthly_pl (month, revenue, expenses, profit, created_at, updated_at)
  WITH monthly_data AS (
    SELECT
      DATE_TRUNC('month', je.txn_date) AS month,
      SUM(CASE 
        WHEN a.account_type = 'Income' AND jel.posting_type = 'Credit' THEN jel.amount
        ELSE 0
      END) AS revenue,
      SUM(CASE 
        WHEN a.account_type = 'Expense' AND jel.posting_type = 'Debit' THEN jel.amount
        ELSE 0
      END) AS expenses
    FROM qbo_journal_entries je
    JOIN qbo_journal_entry_lines jel ON je.id = jel.journal_entry_id
    JOIN qbo_accounts a ON jel.account_id = a.id
    WHERE je.txn_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
    GROUP BY DATE_TRUNC('month', je.txn_date)
  )
  SELECT
    month,
    revenue,
    expenses,
    revenue - expenses AS profit,
    NOW() AS created_at,
    NOW() AS updated_at
  FROM monthly_data
  ORDER BY month;
END;
$$ LANGUAGE plpgsql;
