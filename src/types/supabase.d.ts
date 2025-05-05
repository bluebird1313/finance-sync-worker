declare module '@supabase/supabase-js' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: any
  ): SupabaseClient;
  
  interface SupabaseClient {
    from(table: string): {
      upsert(data: any, options?: { onConflict: string }): Promise<{ data: any; error: any }>;
      select(columns?: string): Promise<{ data: any; error: any }>;
    };
    
    rpc(functionName: string, params?: any): Promise<{ data: any; error: any }>;
  }
}
