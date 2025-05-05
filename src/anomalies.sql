CREATE OR REPLACE FUNCTION detect_financial_anomalies()
RETURNS TABLE (
  type TEXT,
  description TEXT,
  severity TEXT,
  amount NUMERIC
) AS $$
DECLARE
  current_month DATE := DATE_TRUNC('month', CURRENT_DATE);
  previous_month DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
  avg_revenue NUMERIC;
  avg_expenses NUMERIC;
  current_revenue NUMERIC;
  current_expenses NUMERIC;
  revenue_change_pct NUMERIC;
  expense_change_pct NUMERIC;
  large_transactions RECORD;
BEGIN
  SELECT AVG(revenue), AVG(expenses)
  INTO avg_revenue, avg_expenses
  FROM monthly_pl
  WHERE month BETWEEN DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
    AND DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
  
  SELECT revenue, expenses
  INTO current_revenue, current_expenses
  FROM monthly_pl
  WHERE month = current_month;
  
  IF current_revenue IS NULL THEN
    SELECT revenue, expenses
    INTO current_revenue, current_expenses
    FROM monthly_pl
    WHERE month = previous_month;
  END IF;
  
  IF avg_revenue > 0 THEN
    revenue_change_pct := ((current_revenue - avg_revenue) / avg_revenue) * 100;
  ELSE
    revenue_change_pct := 0;
  END IF;
  
  IF avg_expenses > 0 THEN
    expense_change_pct := ((current_expenses - avg_expenses) / avg_expenses) * 100;
  ELSE
    expense_change_pct := 0;
  END IF;
  
  IF revenue_change_pct <= -20 THEN
    type := 'Revenue Decrease';
    description := 'Revenue is down ' || ABS(ROUND(revenue_change_pct, 1)) || '% compared to 6-month average';
    severity := 'High';
    amount := current_revenue;
    RETURN NEXT;
  ELSIF revenue_change_pct >= 50 THEN
    type := 'Revenue Spike';
    description := 'Revenue is up ' || ROUND(revenue_change_pct, 1) || '% compared to 6-month average';
    severity := 'Medium';
    amount := current_revenue;
    RETURN NEXT;
  END IF;
  
  IF expense_change_pct >= 30 THEN
    type := 'Expense Increase';
    description := 'Expenses are up ' || ROUND(expense_change_pct, 1) || '% compared to 6-month average';
    severity := 'High';
    amount := current_expenses;
    RETURN NEXT;
  ELSIF expense_change_pct <= -30 THEN
    type := 'Expense Decrease';
    description := 'Expenses are down ' || ABS(ROUND(expense_change_pct, 1)) || '% compared to 6-month average';
    severity := 'Medium';
    amount := current_expenses;
    RETURN NEXT;
  END IF;
  
  FOR large_transactions IN (
    SELECT 
      t.name, 
      t.amount,
      t.date
    FROM plaid_transactions t
    WHERE t.date >= CURRENT_DATE - INTERVAL '7 days'
    AND t.amount > (
      SELECT AVG(amount) * 3
      FROM plaid_transactions
      WHERE date >= CURRENT_DATE - INTERVAL '90 days'
    )
    ORDER BY t.amount DESC
    LIMIT 5
  ) LOOP
    type := 'Large Transaction';
    description := 'Unusually large transaction: ' || large_transactions.name || ' on ' || large_transactions.date;
    severity := 'Medium';
    amount := ABS(large_transactions.amount);
    RETURN NEXT;
  END LOOP;
  
  FOR large_transactions IN (
    SELECT 
      a.name, 
      a.current_balance
    FROM plaid_accounts a
    WHERE a.current_balance < 0
    ORDER BY a.current_balance ASC
    LIMIT 5
  ) LOOP
    type := 'Negative Balance';
    description := 'Account has negative balance: ' || large_transactions.name;
    severity := 'High';
    amount := ABS(large_transactions.current_balance);
    RETURN NEXT;
  END LOOP;
  
  FOR large_transactions IN (
    WITH category_avg AS (
      SELECT 
        personal_finance_category,
        AVG(amount) as avg_amount
      FROM plaid_transactions
      WHERE date >= CURRENT_DATE - INTERVAL '90 days'
      AND personal_finance_category IS NOT NULL
      GROUP BY personal_finance_category
    ),
    recent_category_spending AS (
      SELECT 
        personal_finance_category,
        SUM(amount) as total_amount
      FROM plaid_transactions
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      AND personal_finance_category IS NOT NULL
      GROUP BY personal_finance_category
    )
    SELECT 
      r.personal_finance_category,
      r.total_amount,
      c.avg_amount,
      (r.total_amount / c.avg_amount) as ratio
    FROM recent_category_spending r
    JOIN category_avg c ON r.personal_finance_category = c.personal_finance_category
    WHERE (r.total_amount / c.avg_amount) > 2
    ORDER BY ratio DESC
    LIMIT 5
  ) LOOP
    type := 'Category Spending Increase';
    description := 'Spending in ' || large_transactions.personal_finance_category || ' is ' || 
                   ROUND(large_transactions.ratio, 1) || 'x higher than average';
    severity := 'Medium';
    amount := large_transactions.total_amount;
    RETURN NEXT;
  END LOOP;
  
  INSERT INTO financial_anomalies (
    type, 
    description, 
    severity, 
    amount, 
    detected_at
  )
  SELECT 
    type, 
    description, 
    severity, 
    amount, 
    NOW()
  FROM detect_financial_anomalies();
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION query_financial_data(query_text TEXT)
RETURNS TABLE (
  result_type TEXT,
  result_text TEXT,
  result_data JSONB
) AS $$
DECLARE
  query_type TEXT;
  query_period TEXT;
  query_category TEXT;
  query_account TEXT;
  result_json JSONB;
BEGIN
  
  IF query_text ILIKE '%revenue%' OR query_text ILIKE '%income%' THEN
    query_type := 'revenue';
  ELSIF query_text ILIKE '%expense%' OR query_text ILIKE '%spending%' THEN
    query_type := 'expenses';
  ELSIF query_text ILIKE '%profit%' OR query_text ILIKE '%margin%' THEN
    query_type := 'profit';
  ELSIF query_text ILIKE '%transaction%' THEN
    query_type := 'transactions';
  ELSIF query_text ILIKE '%account%' OR query_text ILIKE '%balance%' THEN
    query_type := 'accounts';
  ELSE
    query_type := 'general';
  END IF;
  
  IF query_text ILIKE '%today%' OR query_text ILIKE '%yesterday%' THEN
    query_period := 'daily';
  ELSIF query_text ILIKE '%this month%' OR query_text ILIKE '%last month%' THEN
    query_period := 'monthly';
  ELSIF query_text ILIKE '%this year%' OR query_text ILIKE '%last year%' THEN
    query_period := 'yearly';
  ELSIF query_text ILIKE '%quarter%' THEN
    query_period := 'quarterly';
  ELSE
    query_period := 'all';
  END IF;
  
  IF query_type = 'revenue' THEN
    IF query_period = 'monthly' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'Mon YYYY'),
        'revenue', revenue
      ))
      INTO result_json
      FROM monthly_pl
      WHERE month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
      ORDER BY month;
      
      result_type := 'chart';
      result_text := 'Monthly revenue for the past year';
      result_data := result_json;
      RETURN NEXT;
    ELSE
      SELECT jsonb_build_object(
        'current_month', to_char(month, 'Mon YYYY'),
        'revenue', revenue,
        'previous_month', to_char(lag(month) OVER (ORDER BY month), 'Mon YYYY'),
        'previous_revenue', lag(revenue) OVER (ORDER BY month),
        'change_pct', ROUND(((revenue - lag(revenue) OVER (ORDER BY month)) / lag(revenue) OVER (ORDER BY month)) * 100, 1)
      )
      INTO result_json
      FROM monthly_pl
      WHERE month = DATE_TRUNC('month', CURRENT_DATE)
      OR month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
      ORDER BY month DESC
      LIMIT 1;
      
      result_type := 'summary';
      result_text := 'Revenue summary for ' || result_json->>'current_month';
      result_data := result_json;
      RETURN NEXT;
    END IF;
  
  ELSIF query_type = 'expenses' THEN
    IF query_period = 'monthly' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'Mon YYYY'),
        'expenses', expenses
      ))
      INTO result_json
      FROM monthly_pl
      WHERE month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
      ORDER BY month;
      
      result_type := 'chart';
      result_text := 'Monthly expenses for the past year';
      result_data := result_json;
      RETURN NEXT;
    ELSE
      SELECT jsonb_agg(jsonb_build_object(
        'category', personal_finance_category,
        'amount', SUM(amount)
      ))
      INTO result_json
      FROM plaid_transactions
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
      AND amount > 0
      AND personal_finance_category IS NOT NULL
      GROUP BY personal_finance_category
      ORDER BY SUM(amount) DESC
      LIMIT 5;
      
      result_type := 'categories';
      result_text := 'Top expense categories this month';
      result_data := result_json;
      RETURN NEXT;
    END IF;
  
  ELSIF query_type = 'profit' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'month', to_char(month, 'Mon YYYY'),
      'profit', profit,
      'revenue', revenue,
      'expenses', expenses
    ))
    INTO result_json
    FROM monthly_pl
    WHERE month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
    ORDER BY month;
    
    result_type := 'chart';
    result_text := 'Monthly profit for the past year';
    result_data := result_json;
    RETURN NEXT;
  
  ELSIF query_type = 'transactions' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'date', date,
      'name', name,
      'amount', amount,
      'category', personal_finance_category
    ))
    INTO result_json
    FROM plaid_transactions
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY date DESC, ABS(amount) DESC
    LIMIT 10;
    
    result_type := 'transactions';
    result_text := 'Recent transactions';
    result_data := result_json;
    RETURN NEXT;
  
  ELSIF query_type = 'accounts' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'name', name,
      'type', type,
      'balance', current_balance
    ))
    INTO result_json
    FROM plaid_accounts
    ORDER BY current_balance DESC;
    
    result_type := 'accounts';
    result_text := 'Account balances';
    result_data := result_json;
    RETURN NEXT;
  
  ELSE
    WITH current_month AS (
      SELECT * FROM monthly_pl WHERE month = DATE_TRUNC('month', CURRENT_DATE)
    ),
    previous_month AS (
      SELECT * FROM monthly_pl WHERE month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    )
    SELECT jsonb_build_object(
      'current_month', to_char(c.month, 'Mon YYYY'),
      'revenue', c.revenue,
      'revenue_change', ROUND(((c.revenue - p.revenue) / p.revenue) * 100, 1),
      'expenses', c.expenses,
      'expenses_change', ROUND(((c.expenses - p.expenses) / p.expenses) * 100, 1),
      'profit', c.profit,
      'profit_change', CASE WHEN p.profit = 0 THEN NULL ELSE ROUND(((c.profit - p.profit) / ABS(p.profit)) * 100, 1) END
    )
    INTO result_json
    FROM current_month c, previous_month p;
    
    result_type := 'summary';
    result_text := 'Financial summary for ' || result_json->>'current_month';
    result_data := result_json;
    RETURN NEXT;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_financial_embeddings()
RETURNS VOID AS $$
BEGIN
  
  DELETE FROM financial_embeddings;
  
  INSERT INTO financial_embeddings (content_type, content_id, content_text, created_at)
  SELECT 
    'account',
    id,
    'Account: ' || name || ' - Type: ' || account_type || ' - Balance: ' || current_balance,
    NOW()
  FROM qbo_accounts;
  
  INSERT INTO financial_embeddings (content_type, content_id, content_text, created_at)
  SELECT 
    'journal_entry',
    je.id,
    'Journal Entry: ' || je.doc_number || ' - Date: ' || je.txn_date || ' - Note: ' || COALESCE(je.private_note, ''),
    NOW()
  FROM qbo_journal_entries je;
  
  INSERT INTO financial_embeddings (content_type, content_id, content_text, created_at)
  SELECT 
    'transaction',
    id,
    'Transaction: ' || name || ' - Amount: ' || amount || ' - Date: ' || date || ' - Category: ' || COALESCE(personal_finance_category, ''),
    NOW()
  FROM plaid_transactions;
  
END;
$$ LANGUAGE plpgsql;
