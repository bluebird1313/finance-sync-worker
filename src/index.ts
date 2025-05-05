import { syncQuickBooksData } from './sync';

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
  
  TIMEZONE: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Starting scheduled finance sync job");
    
    try {
      const result = await syncQuickBooksData(env);
      
      console.log("Finance sync completed successfully", result);
    } catch (error) {
      console.error("Error in finance sync job:", error);
      
      try {
        await fetch(env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: `❌ Finance sync job failed: ${error.message}`,
          }),
        });
      } catch (slackError) {
        console.error("Failed to send error notification to Slack:", slackError);
      }
    }
  },
  
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
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
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    return new Response('Not found', { status: 404 });
  },
};
