import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pnnyybkffogjjnftrgpk.supabase.co:6543';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
