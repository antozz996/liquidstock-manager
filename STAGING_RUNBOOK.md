# Sprint 0 — Runbook staging / Supabase Branch

Questo runbook è per uno staging separato o una Supabase Branch. Non usarlo sul progetto di produzione senza una nuova approvazione esplicita.

## 0. Creazione manuale dello staging

1. Aprire Supabase Dashboard → selettore organizzazione → **New project** oppure, se il piano lo consente, il progetto produzione → **Branches** → **Create branch**.
2. Usare un nome inequivocabile, per esempio `liquidstock-security-staging`, e una regione compatibile. Non riutilizzare il database password della produzione.
3. Salvare la password generata in un password manager; non inserirla nella chat, nel repository o in file `.env` tracciati.
4. Dalla schermata **Project Settings → General** recuperare soltanto il project ref non sensibile.
5. Dalla schermata **Project Settings → API** recuperare URL staging e chiave publishable/anon. Conservare eventuale service role key solo in un file locale `.env.staging.local`, che è ignorato da Git, con permessi filesystem limitati.
6. Prima di ogni comando eseguire `npx supabase@latest projects list` e confrontare il project ref. Se coincide con produzione, fermarsi.

Quando sarà necessario l’intervento dell’operatore, il valore non sensibile da comunicare è soltanto il project ref. Password, pepper e service role key devono essere inseriti localmente dall’operatore senza mostrarli.

## 1. Identificazione e backup

1. Verificare per iscritto project ref, URL e organizzazione dello staging; confrontarli con produzione e fermarsi se coincidono.
2. Collegare la CLI solo allo staging: `npx supabase@latest link --project-ref <STAGING_PROJECT_REF>`.
3. Salvare fuori dal repository e cifrare:
   - dump schema: `npx supabase@latest db dump --linked --schema public,auth --file <BACKUP_DIR>/schema.sql`;
   - dump dati: `npx supabase@latest db dump --linked --schema public,auth --data-only --use-copy --file <BACKUP_DIR>/data.sql`;
   - configurazione Auth, elenco Edge Function e nomi dei secret presenti;
   - timestamp, project ref, SHA-256 dei dump e commit candidato.
4. Verificare che i dump siano leggibili e ripristinabili in un progetto usa-e-getta prima di procedere.

## 2. Preflight privilegiato

1. Aprire una connessione PostgreSQL privilegiata allo staging in modalità sola lettura.
2. Eseguire `supabase/audit/preflight_security_hardening.sql`.
3. Tutti i conteggi devono essere zero, inclusi utenti senza profilo, profili senza accesso coerente, duplicati, null, orfani e riferimenti cross-venue.
4. Salvare l’output come artefatto della change request. Un solo valore non-zero è **NO-GO**; correggere i dati con piano separato e ripetere backup/preflight.

## 3. Applicazione migration

1. Aprire una finestra di manutenzione staging e bloccare test concorrenti.
2. Applicare soltanto `supabase/migrations/20260721090000_security_hardening.sql` tramite la pipeline migration approvata o `psql -v ON_ERROR_STOP=1 -f ...` sulla connessione staging.
3. Verificare subito: 41 policy, RLS attiva su tutte le 15 tabelle applicative, zero grant tabella ad anon e zero policy aperte.
4. Eseguire la migration una seconda volta nello staging usa-e-getta per confermare la ripetibilità; non è necessario ripeterla sullo staging condiviso.

## 4. Secret e configurazione Edge

1. Generare fuori dal repository un pepper casuale distinto da produzione.
2. Configurare nel secret store dello staging:
   - `ALLOWED_ORIGINS=https://<FRONTEND_STAGING_HOST>`;
   - `REGISTRATION_RATE_LIMIT_PEPPER=<VALORE_CASUALE>`.
3. Non impostare manualmente nel frontend la service role key. Le variabili `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono fornite all’Edge runtime da Supabase.
4. Verificare i soli nomi con `npx supabase@latest secrets list`; non copiare valori in log o ticket.

## 5. Deploy funzioni e Auth staging

1. Deploy amministrativo con JWT: `npx supabase@latest functions deploy create-registration-invite --project-ref <STAGING_PROJECT_REF>`.
2. Deploy registrazione anonima controllata: `npx supabase@latest functions deploy register-with-invite --project-ref <STAGING_PROJECT_REF> --no-verify-jwt`.
3. Applicare la configurazione staging di `supabase/config.toml` con `npx supabase@latest config push` dopo aver verificato il progetto collegato.
4. Controllare nel Dashboard staging:
   - signup globale disabilitato;
   - anonymous sign-in disabilitato;
   - provider email/password abilitato;
   - login degli utenti esistenti non disabilitato.
5. Verificare dall’elenco funzioni: create `verify_jwt=true`, register `verify_jwt=false`.

## 6. Frontend staging

1. Configurare nel sistema di build staging soltanto `VITE_SUPABASE_URL` e la chiave anon/publishable dello staging.
2. Controllare che nessuna variabile punti alla produzione e che nessuna service role key sia presente nel bundle o nelle sorgenti pubblicate.
3. Costruire e pubblicare solo sul dominio staging; aggiungere il suo origin esatto a `ALLOWED_ORIGINS`.
4. Svuotare cache/service worker del browser di test prima della prima sessione.

## 7. Test obbligatori

Eseguire con dati sintetici e account dedicati:

1. anon: nessuna lettura/scrittura su tabelle applicative; signup diretto negato;
2. authenticated senza accesso: solo proprio profilo, nessuna venue;
3. staff venue A: lettura/scrittura consentita solo secondo matrice; prezzi/anagrafica non modificabili;
4. admin A: invito A consentito, invito B negato;
5. super admin: gestione globale esplicita;
6. multi-venue A+B: selettore e isolamento A+B, venue C negata;
7. registrazione: monouso, riuso, concorrenza, scadenza, revoca, email esistente, payload ruolo/venue e rate limit;
8. flussi frontend: login, logout, registrazione staff, cambio venue, prodotti, apertura/chiusura serata, arrivi, report, storico, analytics, team e locali;
9. CORS sul gateway pubblico: origin staging riflesso esattamente; origin non autorizzato senza header permissivo e con 403 prima della logica;
10. log: nessun token invito, password, pepper o service role key.

## 8. Rollback staging

1. Sospendere frontend e nuove registrazioni.
2. Se non sono stati creati dati Sprint 0 da conservare, eseguire `supabase/rollback/20260721090000_security_hardening_rollback.sql` con `ON_ERROR_STOP`.
3. Ripristinare configurazione Auth e funzioni dal backup/config snapshot precedente; rimuovere i due secret custom solo dopo aver disattivato le funzioni.
4. Verificare baseline legacy: 35 policy, 3 tabelle RLS disattivate, 91 grant tabella anon.
5. Poiché il rollback riapre vulnerabilità critiche, non riaprire uno staging raggiungibile pubblicamente: limitarne l’accesso o ripristinare integralmente il backup in un nuovo progetto.
6. Se esistono utenti/inviti creati dopo la migration o il rollback SQL non è appropriato, preferire il ripristino completo del backup in un nuovo staging.

## 9. Go / no-go

**GO** solo se: backup ripristinabile, preflight tutto zero, 148/148 test equivalenti passano, smoke frontend pulito, login esistente funzionante, Team multi-venue verificato, CORS effettivo ristretto, nessun segreto nel bundle/log, rollback provato e approvazione formale presente.

**NO-GO** per: target ambiguo o produzione, qualunque anomalia preflight, policy/grant inattesi, orfani, test multi-venue falliti, header CORS wildcard sul gateway, logout/login instabile, segreto esposto, rollback non riproducibile o differenze non spiegate rispetto al dump corrente.
