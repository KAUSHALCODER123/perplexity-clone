import { supabase } from './supabaseClient.ts';

async function check() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  console.log("Users table:", data, error);

  const { data: convData, error: convError } = await supabase.from('conversations').select('*').limit(1);
  console.log("Conversations table:", convData, convError);
}
check();
