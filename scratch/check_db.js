import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rznutcaihzgfhpjrupzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6bnV0Y2FpaHpnZmhwanJ1cHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTgzMjAsImV4cCI6MjA5MjA5NDMyMH0.AsTfnEReUwKNjTApHL1jkmUUG4uwTU4JMOhYQFv_l7E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupProfilesTable() {
  console.log('Verifica e creazione della tabella PROFILES...');
  
  // Nota: via API client non possiamo creare tabelle (DDL). 
  // Dobbiamo sperare che l'utente l'abbia creata o usare una query per vedere se c'è.
  // In alternativa, inseriamo un profilo di test per vedere se fallisce.
  
  const { error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);
    
  if (error && error.code === '42P01') {
    console.error('La tabella "profiles" non esiste! Per favore chiedi all\'utente di crearla su Supabase SQL Editor.');
    console.log('SQL da eseguire:');
    console.log(`
      create table public.profiles (
        id uuid references auth.users on delete cascade primary key,
        role text check (role in ('admin', 'staff')) default 'staff',
        updated_at timestamp with time zone default timezone('utc'::text, now())
      );
      
      -- Abilita RLS
      alter table public.profiles enable row level security;
      
      -- Policy per leggere i propri dati
      create policy "Can view own profile" on public.profiles for select using (auth.uid() = id);
    `);
  } else {
    console.log('Tabella profiles trovata o accessibile.');
  }
}

setupProfilesTable();
