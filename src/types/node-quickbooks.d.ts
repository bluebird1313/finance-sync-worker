declare module 'node-quickbooks' {
  export default class QuickBooks {
    constructor(
      consumerKey: string,
      consumerSecret: string,
      oauthToken: string,
      oauthTokenSecret: boolean,
      realmId: string,
      useSandbox: boolean,
      debug: boolean,
      minorversion?: string | null,
      oAuthVersion?: string,
      userAgent?: string | null
    );
    
    token: string;
    
    refreshAccessToken(callback: (err: any, authResponse: any) => void): void;
    
    findAccounts(options: any, callback: (err: any, accounts: any[]) => void): void;
    
    findJournalEntries(options: any, callback: (err: any, journalEntries: any[]) => void): void;
  }
}
