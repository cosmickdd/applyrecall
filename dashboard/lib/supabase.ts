import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      // In local dev without Supabase keys, use a placeholder URL/key so createClient doesn't throw during initial module evaluation
      supabaseInstance = createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        supabaseAnonKey || 'placeholder-anon-key',
        {
          auth: {
            persistSession: typeof window !== 'undefined',
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }
      );
    } else {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: typeof window !== 'undefined',
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
  }
  return supabaseInstance;
}

export const supabase = getSupabase();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
