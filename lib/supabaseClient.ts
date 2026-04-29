import { createClient } from '@supabase/supabase-js'

// Прямое указание ключей (для теста)
const supabaseUrl = 'https://pnnyybkffogjjnftrgpk.supabase.co'
const supabaseAnonKey = 'sb_publishable_L7DucK1bLCuiWHY-RXvdDg_UK2oGfDX'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
