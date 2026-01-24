// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fkgmapnuzphaleuyffkq.supabase.co' // Cole a URL do passo 1
const supabaseKey = 'sb_publishable_rNVV5yb6NZNCg7ImXxrpjA_ZXbxr3t0'    // Cole a Key do passo 1

export const supabase = createClient(supabaseUrl, supabaseKey)