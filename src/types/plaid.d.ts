declare module 'plaid' {
  export class Configuration {
    constructor(config: {
      basePath: string;
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': string;
          'PLAID-SECRET': string;
        };
      };
    });
  }
  
  export class PlaidApi {
    constructor(configuration: Configuration);
    
    accountsGet(params: {
      access_token: string;
    }): Promise<{
      data: {
        accounts: Array<{
          account_id: string;
          name: string;
          mask: string;
          official_name: string;
          type: string;
          subtype: string;
          balances: {
            current: number;
            available: number;
          };
        }>;
      };
    }>;
    
    transactionsGet(params: {
      access_token: string;
      start_date: string;
      end_date: string;
      options?: {
        include_personal_finance_category?: boolean;
      };
    }): Promise<{
      data: {
        transactions: Array<{
          transaction_id: string;
          account_id: string;
          amount: number;
          date: string;
          name: string;
          merchant_name: string;
          payment_channel: string;
          pending: boolean;
          category: string[];
          category_id: string;
          personal_finance_category?: {
            primary: string;
          };
        }>;
      };
    }>;
  }
  
  export const PlaidEnvironments: {
    sandbox: string;
    production: string;
  };
}
