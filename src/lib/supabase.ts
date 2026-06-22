import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. ' +
    'Revisá tu archivo .env.local (en desarrollo) o las Environment Variables de Vercel (en producción).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);