import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rznutcaihzgfhpjrupzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6bnV0Y2FpaHpnZmhwanJ1cHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTgzMjAsImV4cCI6MjA5MjA5NDMyMH0.AsTfnEReUwKNjTApHL1jkmUUG4uwTU4JMOhYQFv_l7E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupConfigsTable() {
  console.log('Verifica e creazione della tabella CONFIGS...');
  
  const { error } = await supabase
    .from('configs')
    .select('*')
    .limit(1);
    
  if (error && error.code === '42P01') {
    console.log('La tabella "configs" non esiste. SQL da eseguire:');
    console.log(`
      create table public.configs (
        key text primary key,
        value text,
        updated_at timestamp with time zone default timezone('utc'::text, now())
      );
      
      -- Inserisci il codice di default
      insert into public.configs (key, value) values ('registration_code', 'LIQUID2026');
      
      -- Abilita RLS
      alter table public.configs enable row level security;
      
      -- Policy: Tutti possono leggere (per verificare il codice in fase di signup)
      create policy "Anyone can read configs" on public.configs for select using (true);
      
      -- Policy: Solo Admin può aggiornare (da implementare con verifica ruolo)
      -- Per brevità ora permettiamo l'update se autenticato o tramite dashboard.
    `);
  } else {
    console.log('Tabella configs trovata o già configurata.');
  }
}

setupConfigsTable();
