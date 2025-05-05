import { createClient } from '@supabase/supabase-js';
import QuickBooks from 'node-quickbooks';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { Env } from './index';

export { getQuickBooksClient, getPlaidClient, syncGeneralLedger, syncBankTransactions, checkAnomalies };

function getQuickBooksClient(env: Env): Promise<any> {
  return new Promise((resolve, reject) => {
    const qbo = new QuickBooks(
      env.QBO_CLIENT_ID,
      env.QBO_CLIENT_SECRET,
      env.QBO_REFRESH_TOKEN,
      false, // no token secret for oAuth 2.0
      env.QBO_REALM_ID,
      true, // use the sandbox?
      false, // enable debugging?
      null, // set minorversion
      '2.0', // oAuth version
      null // user agent
    );
    
    qbo.refreshAccessToken((err, authResponse) => {
      if (err) {
        console.error('Error refreshing QuickBooks token:', err);
        return reject(err);
      }
      
      qbo.token = authResponse.access_token;
      resolve(qbo);
    });
  });
}

function getPlaidClient(env: Env): PlaidApi {
  const configuration = new Configuration({
    basePath: env.PLAID_ENV === 'sandbox' 
      ? PlaidEnvironments.sandbox 
      : PlaidEnvironments.production,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID,
        'PLAID-SECRET': env.PLAID_SECRET,
      },
    },
  });
  
  return new PlaidApi(configuration);
}

export function getSupabaseClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE);
}

async function syncGeneralLedger(qbo: any, supabase: any): Promise<any> {
  return new Promise((resolve, reject) => {
    qbo.findAccounts({
      fetchAll: true
    }, async (err: any, accounts: any[]) => {
      if (err) {
        console.error('Error fetching QuickBooks accounts:', err);
        return reject(err);
      }
      
      const { data: accountsData, error: accountsError } = await supabase
        .from('qbo_accounts')
        .upsert(
          accounts.map((account: any) => ({
            id: account.Id,
            name: account.Name,
            account_type: account.AccountType,
            account_subtype: account.AccountSubType,
            fully_qualified_name: account.FullyQualifiedName,
            active: account.Active,
            current_balance: account.CurrentBalance,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })),
          { onConflict: 'id' }
        );
      
      if (accountsError) {
        console.error('Error storing QuickBooks accounts:', accountsError);
        return reject(accountsError);
      }
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      qbo.findJournalEntries({
        fetchAll: true,
        where: `TxnDate >= '${startDate.toISOString().split('T')[0]}'`
      }, async (err: any, journalEntries: any[]) => {
        if (err) {
          console.error('Error fetching QuickBooks journal entries:', err);
          return reject(err);
        }
        
        for (const entry of journalEntries) {
          const { data: entryData, error: entryError } = await supabase
            .from('qbo_journal_entries')
            .upsert({
              id: entry.Id,
              txn_date: entry.TxnDate,
              doc_number: entry.DocNumber,
              private_note: entry.PrivateNote,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
            
          if (entryError) {
            console.error('Error storing journal entry:', entryError);
            continue;
          }
          
          if (entry.Line && entry.Line.length > 0) {
            const lineItems = entry.Line.map((line: any) => ({
              journal_entry_id: entry.Id,
              line_id: line.Id,
              account_id: line.JournalEntryLineDetail?.AccountRef?.value,
              description: line.Description,
              amount: line.Amount,
              posting_type: line.JournalEntryLineDetail?.PostingType,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));
            
            const { error: lineError } = await supabase
              .from('qbo_journal_entry_lines')
              .upsert(lineItems, { onConflict: 'journal_entry_id, line_id' });
              
            if (lineError) {
              console.error('Error storing journal entry lines:', lineError);
            }
          }
        }
        
        resolve({
          accounts: accounts.length,
          journalEntries: journalEntries.length
        });
      });
    });
  });
}

async function syncBankTransactions(plaidClient: PlaidApi, accessToken: string, supabase: any): Promise<any> {
  try {
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken
    });
    
    const accounts = accountsResponse.data.accounts;
    
    const { error: accountsError } = await supabase
      .from('plaid_accounts')
      .upsert(
        accounts.map(account => ({
          id: account.account_id,
          name: account.name,
          mask: account.mask,
          official_name: account.official_name,
          type: account.type,
          subtype: account.subtype,
          current_balance: account.balances.current,
          available_balance: account.balances.available,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'id' }
      );
      
    if (accountsError) {
      console.error('Error storing Plaid accounts:', accountsError);
      throw accountsError;
    }
    
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDateStr,
      end_date: endDate,
      options: {
        include_personal_finance_category: true
      }
    });
    
    const transactions = transactionsResponse.data.transactions;
    
    const { error: transactionsError } = await supabase
      .from('plaid_transactions')
      .upsert(
        transactions.map(transaction => ({
          id: transaction.transaction_id,
          account_id: transaction.account_id,
          amount: transaction.amount,
          date: transaction.date,
          name: transaction.name,
          merchant_name: transaction.merchant_name,
          payment_channel: transaction.payment_channel,
          pending: transaction.pending,
          category: transaction.category,
          category_id: transaction.category_id,
          personal_finance_category: transaction.personal_finance_category?.primary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'id' }
      );
      
    if (transactionsError) {
      console.error('Error storing Plaid transactions:', transactionsError);
      throw transactionsError;
    }
    
    return {
      accounts: accounts.length,
      transactions: transactions.length
    };
  } catch (error: any) {
    console.error('Error syncing bank transactions:', error);
    throw error;
  }
}

async function checkAnomalies(supabase: any, slackWebhookUrl: string): Promise<any> {
  try {
    const { data: anomalies, error } = await supabase
      .rpc('detect_financial_anomalies');
      
    if (error) {
      console.error('Error detecting anomalies:', error);
      throw error;
    }
    
    if (anomalies && anomalies.length > 0) {
      const message = {
        text: '🚨 Financial Anomalies Detected',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 Financial Anomalies Detected',
              emoji: true
            }
          },
          {
            type: 'divider'
          },
          ...anomalies.map((anomaly: any) => ({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${anomaly.type}*: ${anomaly.description}\n*Severity*: ${anomaly.severity}\n*Amount*: $${anomaly.amount.toFixed(2)}`
            }
          })),
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Detected at ${new Date().toISOString()}`
              }
            ]
          }
        ]
      };
      
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      });
    }
    
    return {
      anomaliesDetected: anomalies.length
    };
  } catch (error: any) {
    console.error('Error checking anomalies:', error);
    throw error;
  }
}

export async function syncQuickBooksData(env: Env): Promise<any> {
  try {
    const qbo = await getQuickBooksClient(env);
    const plaidClient = getPlaidClient(env);
    const supabase = getSupabaseClient(env);
    
    console.log('Syncing QuickBooks general ledger...');
    const glResult = await syncGeneralLedger(qbo, supabase);
    console.log('General ledger sync complete:', glResult);
    
    console.log('Syncing bank transactions...');
    const bankResult = await syncBankTransactions(plaidClient, env.PLAID_ACCESS_TOKEN, supabase);
    console.log('Bank transactions sync complete:', bankResult);
    
    console.log('Checking for anomalies...');
    const anomalyResult = await checkAnomalies(supabase, env.SLACK_WEBHOOK_URL);
    console.log('Anomaly check complete:', anomalyResult);
    
    console.log('Generating monthly P&L view...');
    const { error: plError } = await supabase.rpc('generate_monthly_pl_view');
    if (plError) {
      console.error('Error generating P&L view:', plError);
    } else {
      console.log('Monthly P&L view generated successfully');
    }
    
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: `✅ Finance sync completed successfully:\n• ${glResult.accounts} accounts\n• ${glResult.journalEntries} journal entries\n• ${bankResult.accounts} bank accounts\n• ${bankResult.transactions} bank transactions\n• ${anomalyResult.anomaliesDetected} anomalies detected`,
      }),
    });
    
    return {
      generalLedger: glResult,
      bankTransactions: bankResult,
      anomalies: anomalyResult
    };
  } catch (error: any) {
    console.error('Error in syncQuickBooksData:', error);
    throw error;
  }
}
