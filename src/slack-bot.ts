import { Env } from './index';
import { createClient } from '@supabase/supabase-js';

export async function processSlackCommand(text: string, env: Env): Promise<any> {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE);
    
    const { data, error } = await supabase.rpc('query_financial_data', {
      query_text: text
    });
    
    if (error) throw error;
    
    return formatSlackResponse(data);
  } catch (error: any) {
    console.error('Error processing Slack command:', error);
    return {
      response_type: 'ephemeral',
      text: `Error: ${error.message || 'Unknown error occurred'}`
    };
  }
}

function formatSlackResponse(data: any[]): any {
  if (!data || data.length === 0) {
    return {
      response_type: 'ephemeral',
      text: "I couldn't find any data matching your query."
    };
  }
  
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Financial Data Query Results',
        emoji: true
      }
    },
    {
      type: 'divider'
    }
  ];
  
  data.forEach(result => {
    const { result_type, result_text, result_data } = result;
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${result_text}*`,
        emoji: true
      }
    });
    
    if (result_type === 'chart') {
      const chartData = result_data;
      let chartText = '';
      
      chartData.forEach((item: any) => {
        let row = '';
        Object.entries(item).forEach(([key, value]) => {
          if (key === 'month') {
            row += `${value}: `;
          } else {
            row += `$${Number(value).toLocaleString()} `;
          }
        });
        chartText += row + '\n';
      });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '```' + chartText + '```',
          emoji: true
        }
      });
    } else if (result_type === 'summary') {
      let summaryText = '';
      Object.entries(result_data).forEach(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        if (typeof value === 'number' && (key.includes('revenue') || key.includes('expense') || key.includes('profit') || key.includes('balance') || key.includes('amount'))) {
          summaryText += `*${formattedKey}*: $${Number(value).toLocaleString()}\n`;
        } else if (key.includes('change') && typeof value === 'number') {
          const emoji = Number(value) > 0 ? '📈' : '📉';
          summaryText += `*${formattedKey}*: ${value}% ${emoji}\n`;
        } else {
          summaryText += `*${formattedKey}*: ${value}\n`;
        }
      });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: summaryText,
          emoji: true
        }
      });
    } else if (result_type === 'transactions' || result_type === 'accounts' || result_type === 'categories') {
      let listText = '';
      
      result_data.forEach((item: any) => {
        let line = '• ';
        
        if (result_type === 'transactions') {
          line += `*${item.date}* - ${item.name}: $${Math.abs(Number(item.amount)).toLocaleString()} ${Number(item.amount) < 0 ? '💸' : '💰'}`;
        } else if (result_type === 'accounts') {
          line += `*${item.name}* (${item.type}): $${Number(item.balance).toLocaleString()}`;
        } else if (result_type === 'categories') {
          line += `*${item.category}*: $${Number(item.amount).toLocaleString()}`;
        }
        
        listText += line + '\n';
      });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: listText,
          emoji: true
        }
      });
    }
  });
  
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `_Generated at ${new Date().toLocaleString()}_`
      }
    ]
  } as any);
  
  return {
    response_type: 'in_channel',
    blocks
  };
}

export async function handleSlackSlashCommand(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const text = formData.get('text') as string;
    const token = formData.get('token') as string;
    
    if (!token || token !== env.SLACK_VERIFICATION_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const response = await processSlackCommand(text, env);
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error handling Slack slash command:', error);
    return new Response(JSON.stringify({ 
      response_type: 'ephemeral',
      text: `Error processing your request: ${error.message || 'Unknown error occurred'}`
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
