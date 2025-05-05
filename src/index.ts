import { 
  syncQuickBooksData, 
  getSupabaseClient, 
  getQuickBooksClient, 
  getPlaidClient, 
  syncGeneralLedger, 
  syncBankTransactions, 
  checkAnomalies 
} from './sync';
import { handleSlackSlashCommand } from './slack-bot';
import { createClient } from '@supabase/supabase-js';

export interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface Env {
  QBO_CLIENT_ID: string;
  QBO_CLIENT_SECRET: string;
  QBO_REFRESH_TOKEN: string;
  QBO_REALM_ID: string;
  
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
  PLAID_ACCESS_TOKEN: string;
  
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE: string;
  
  SLACK_WEBHOOK_URL: string;
  SLACK_VERIFICATION_TOKEN: string;
  
  TIMEZONE: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Starting scheduled finance sync job");
    
    try {
      const result = await syncQuickBooksData(env);
      
      console.log("Finance sync completed successfully", result);
    } catch (error: any) {
      console.error("Error in finance sync job:", error);
      
      try {
        await fetch(env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: `❌ Finance sync job failed: ${error.message || 'Unknown error occurred'}`,
          }),
        });
      } catch (slackError: any) {
        console.error("Failed to send error notification to Slack:", slackError);
      }
    }
  },
  
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/slack/command') {
      return handleSlackSlashCommand(request, env);
    }
    
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== env.QBO_CLIENT_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    if (url.pathname === '/sync') {
      try {
        const result = await syncQuickBooksData(env);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (url.pathname === '/query') {
      try {
        const { text } = await request.json() as { text: string };
        
        if (!text) {
          return new Response(JSON.stringify({ error: 'Missing query text' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        const supabase = getSupabaseClient(env);
        
        const { data, error } = await supabase.rpc('query_financial_data', {
          query_text: text
        });
        
        if (error) throw error;
        
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (url.pathname === '/sync/quickbooks') {
      try {
        const qbo = await getQuickBooksClient(env);
        const supabase = getSupabaseClient(env);
        const result = await syncGeneralLedger(qbo, supabase);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (url.pathname === '/sync/plaid') {
      try {
        const plaidClient = getPlaidClient(env);
        const supabase = getSupabaseClient(env);
        const result = await syncBankTransactions(plaidClient, env.PLAID_ACCESS_TOKEN, supabase);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (url.pathname === '/sync/anomalies') {
      try {
        const supabase = getSupabaseClient(env);
        const result = await checkAnomalies(supabase, env.SLACK_WEBHOOK_URL);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    return new Response('Not found', { status: 404 });
  },
};
