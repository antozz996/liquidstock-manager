-- 1. Aggiungi il campo full_name ai profili
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Funzione per gestire la creazione automatica del profilo alla registrazione
-- Recupera nome, ruolo e locale dai metadati inseriti durante il signUp
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, venue_id)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'staff'),
    (new.raw_user_meta_data->>'venue_id')::uuid
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger che si attiva dopo l'inserimento in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Aggiorna i profili esistenti se necessario (opzionale)
-- UPDATE public.profiles SET full_name = 'Utente Storico' WHERE full_name IS NULL;
