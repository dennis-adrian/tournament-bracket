import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      'Este concurso necesita VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    );
  }
  if (!client) {
    client = createClient(url, key);
  }
  return client;
}

export function publicImageUrl(path: string): string {
  if (!url) return '';
  return `${url}/storage/v1/object/public/contest-entries/${path}`;
}
