# Finance Sync Worker

A Cloudflare Worker + Supabase pipeline that nightly syncs QuickBooks general ledger and bank transactions into Supabase, builds a monthly P&L view, and posts Slack alerts for anomalies.

## 📦 Project Structure

finance-sync-worker/
├─ wrangler.toml
├─ package.json
├─ .env.example
├─ README.md
└─ src/
   ├─ index.ts
   ├─ sync.ts
   ├─ schema.sql
   └─ anomalies.sql


- **wrangler.toml** — Cloudflare Worker config & cron schedule  
- **package.json** — Dependencies & publish script  
- **.env.example** — Required environment variables  
- **src/index.ts** — Main Worker entry point
- **src/sync.ts** — QuickBooks & Plaid data sync logic  
- **src/schema.sql** — Supabase schema setup
- **src/anomalies.sql** — Supabase RPC definition for anomaly checks  

## 🔑 Prerequisites

1. **Cloudflare Account** with Workers & Cron Triggers enabled  
2. **Supabase Project** with:
   - Access to SQL Editor  
   - A _Service Role_ API key  
3. **QuickBooks Online** Developer app (Production credentials)  
4. **Plaid** account & at least one linked bank item (for bank feeds)  
5. **Slack** Incoming Webhook URL (for alerts)  
6. **Node.js ≥16** & **npm** installed  
7. **Wrangler CLI v2** installed (`npm install -g wrangler`)

## ⚙️ Environment Variables

Copy `.env.example` → `.env` and fill in:

```dotenv
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REFRESH_TOKEN=
QBO_REALM_ID=

PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox            # or "production"
PLAID_ACCESS_TOKEN=          # from Plaid Link

SUPABASE_URL=                # e.g. https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE=       # Supabase service-role key

SLACK_WEBHOOK_URL=           # e.g. https://hooks.slack.com/services/...
TIMEZONE=America/Chicago
```

## 🚀 Setup & Deployment

1. Install dependencies:
   ```
   npm install
   ```

2. Set up Supabase schema:
   - Go to your Supabase project SQL Editor
   - Run the SQL from `src/schema.sql` to create tables
   - Run the SQL from `src/anomalies.sql` to create RPC functions

3. Set up Cloudflare Worker secrets:
   ```
   wrangler secret put QBO_CLIENT_ID
   wrangler secret put QBO_CLIENT_SECRET
   # ... and so on for all environment variables
   ```

4. Deploy the worker:
   ```
   npm run deploy
   ```

## 📊 Features

- Nightly sync of QuickBooks general ledger transactions
- Nightly sync of bank transactions via Plaid
- Monthly P&L view generation
- Anomaly detection for unusual financial patterns
- Slack alerts for financial anomalies
- AI-powered natural language querying of financial data

## 🧠 How It Works

1. The worker runs on a nightly schedule (3 AM by default)
2. It fetches the latest transactions from QuickBooks and Plaid
3. Data is stored in Supabase tables with proper relationships
4. Anomaly detection SQL functions analyze the data for unusual patterns
5. Alerts are sent to Slack when anomalies are detected
6. The Slack bot can answer natural language questions about finances

## 🤖 Slack Bot Commands

The Finance Sync Worker includes a Slack bot that can answer natural language questions about your financial data. Use the `/finance` slash command followed by your question.

### Example Queries

Try these example queries with the `/finance` slash command:

```
/finance What was our revenue last month?
/finance Show me our top 5 expenses this quarter
/finance What's our current cash position?
/finance Compare revenue between Q1 and Q2
/finance What's our profit margin trend over the past 6 months?
/finance Show me unusual transactions over $1000 in the last week
/finance What accounts have had the most activity this month?
/finance How much did we spend on marketing last quarter?
/finance What's our burn rate?
/finance Show me our balance sheet
```

### Tips for Better Results

- Be specific about time periods (e.g., "last month", "Q2", "past 30 days")
- Use financial terms the system will understand (revenue, expenses, profit margin, etc.)
- Ask for comparisons between time periods to spot trends
- You can ask for specific accounts or categories (e.g., "marketing expenses", "software subscriptions")
- For complex queries, break them down into simpler questions

### Setting Up the Slack Bot

See the detailed setup instructions in `src/slack-setup.html` for how to:
1. Create a Slack app
2. Configure slash commands
3. Set up permissions
4. Configure incoming webhooks
