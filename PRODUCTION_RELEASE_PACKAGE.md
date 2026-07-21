# Sprint 0 — Production release package

Questo documento prepara un rilascio futuro; non autorizza né esegue operazioni sul progetto ospitato. Tutti i valori fra `<...>` sono placeholder. Password, service-role key, token e pepper non devono essere inseriti in ticket, chat, cronologia shell o repository.

## 1. Gate preliminari

1. Approvazione formale, finestra di manutenzione e responsabili nominati per database, Auth, Edge e frontend.
2. Commit candidato immutabile e working tree pulito; scansione segreti dell’intero indice Git.
3. Nuovo dump schema-only ospitato confrontato con l’audit del 21 luglio 2026. Qualsiasi drift richiede nuovo audit.
4. Import Excel disabilitato oppure `xlsx@0.18.5` sostituito e testato.
5. Artifact frontend precedente conservato e immediatamente ridistribuibile.
6. Procedura di ripristino del backup provata localmente.

## 2. Backup

Prima della finestra:

1. Attivare/verificare backup gestito Supabase e annotare l’ultimo punto ripristinabile.
2. Creare `<SECURE_BACKUP_DIR>` fuori dal repository, con permessi filesystem `0700` e cifratura.
3. Usando una connessione PostgreSQL privilegiata fornita tramite password manager, eseguire:

```bash
pg_dump --dbname='<SECURE_DATABASE_URL>' --schema-only --no-owner --file='<SECURE_BACKUP_DIR>/schema-before.sql'
pg_dump --dbname='<SECURE_DATABASE_URL>' --data-only --format=custom --schema=public --schema=auth --file='<SECURE_BACKUP_DIR>/data-before.dump'
sha256sum '<SECURE_BACKUP_DIR>/schema-before.sql' '<SECURE_BACKUP_DIR>/data-before.dump'
```

4. Esportare separatamente configurazione Auth, elenco/versione Edge Function, nomi dei secret, redirect URL, SMTP e artifact frontend attivo. Non esportare valori secret nei log.
5. Verificare leggibilità dei dump e registrare timestamp, project ref e hash del commit candidato.

## 3. Preflight privilegiato read-only

Eseguire dalla root del commit candidato:

```bash
psql '<SECURE_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/audit/preflight_security_hardening.sql
```

Lo script apre `BEGIN TRANSACTION READ ONLY` e termina con rollback. Prima della remediation possono essere `STOP` soltanto i tre blocker già diagnosticati (`auth_users_without_any_venue_access`, `non_super_primary_venue_access_missing`, `legacy_registration_codes_not_invalidated`); ogni altro `STOP` blocca il rilascio. Dopo la remediation tutte le righe dei primi due result set devono essere `PASS`.

### STOP immediato

- target/project ref ambiguo;
- backup mancante, non leggibile o senza hash;
- qualunque anomalia dati non-zero diversa dai tre blocker approvati: utenti/profili/accessi mancanti, null, duplicati, orfani o cross-venue;
- impronta schema diversa da 13 tabelle, 35 policy, 3 RLS disattivate, 9 policy aperte, 91 grant anon e 4 `SECURITY DEFINER` senza search path fissato;
- una riga legacy `registration_code` senza venue valida oppure assenza del vincolo univoco `(key, venue_id)`; il numero totale è informativo perché può esistere una riga legittima per ogni venue;
- schema ospitato diverso dal dump auditato;
- import Excel vulnerabile ancora disponibile;
- assenza di artifact frontend/rollback verificato.

I tre blocker dati già approvati (`venue_access` primario mancante e codici legacy) si correggono esclusivamente con `supabase/release/remediate_production_preflight_blockers.sql`, dopo backup e maintenance mode. Qualunque altro STOP richiede un piano dati separato, nuovo backup e nuovo preflight.

## 4. Ordine esatto del rilascio

1. Abilitare maintenance mode o impedire nuove registrazioni e modifiche concorrenti.
2. Ricontrollare `<PRODUCTION_PROJECT_REF>` e commit candidato.
3. Eseguire la remediation approvata, verificare che inserisca soltanto gli accessi primari mancanti e invalidi tutte le righe legacy, quindi rieseguire il preflight fino a ottenere solo `PASS`:

```bash
psql '<SECURE_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/release/remediate_production_preflight_blockers.sql
psql '<SECURE_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/audit/preflight_security_hardening.sql
```

4. Applicare una sola volta la migration transazionale:

```bash
psql '<SECURE_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/migrations/20260721090000_security_hardening.sql
```

5. Verificare immediatamente: 41 policy, zero tabelle `public` senza RLS, zero grant tabella `anon`, zero policy `true`, 15 tabelle applicative e funzioni `SECURITY DEFINER` con `search_path` fissato. Verificare inoltre che tutte le righe `configs` siano ancora presenti e che ogni `registration_code` sia un marker invalidato.
6. Nel secret store Edge configurare:
   - `ALLOWED_ORIGINS=<EXACT_PRODUCTION_FRONTEND_ORIGIN>` senza slash finale e senza wildcard;
   - `REGISTRATION_RATE_LIMIT_PEPPER=<NEW_RANDOM_SECRET>`.
7. Distribuire le funzioni dal commit candidato:

```bash
supabase functions deploy create-registration-invite --project-ref <PRODUCTION_PROJECT_REF>
supabase functions deploy register-with-invite --project-ref <PRODUCTION_PROJECT_REF> --no-verify-jwt
```

8. Verificare dal Dashboard: `create-registration-invite` con verifica JWT attiva; `register-with-invite` senza verifica gateway perché pre-login.
9. In Authentication → Providers/Settings:
   - disabilitare signup globale/diretto;
   - lasciare abilitato il provider email/password per il login;
   - lasciare disabilitato anonymous sign-in;
   - non cambiare session lifetime o utenti esistenti.
10. Eseguire login di un utente esistente prima del deploy frontend.
11. Costruire il frontend con soli `VITE_SUPABASE_URL` e anon/publishable key di produzione. Verificare che bundle e sourcemap non contengano service-role key, pepper, URL database o token invito.
12. Distribuire l’artifact frontend in modo atomico conservando `<PREVIOUS_FRONTEND_ARTIFACT>`.
13. Pulire/invalidate service worker e cache secondo la piattaforma di hosting.

## 5. Smoke test immediati

Con account dedicati e due venue:

1. login e logout utente esistente;
2. anon non legge alcuna tabella applicativa e signup diretto fallisce;
3. admin A crea invito A ma non B; admin B resta isolato;
4. registrazione valida crea sempre staff e `venue_access` dell’invito;
5. riuso, scadenza, revoca, concorrenza e payload role/venue sono negati genericamente;
6. multi-venue vede solo A+B e una venue falsificata in localStorage viene eliminata;
7. prodotti, apertura/chiusura serata, arrivi, report, storico, analytics, Team e activity log;
8. origin produzione riflesso esattamente; origin estraneo riceve 403 senza header wildcard;
9. log privi di token, password, pepper e service-role key;
10. monitoraggio errori Auth/Edge/PostgREST per almeno 30 minuti.

Un singolo fallimento è NO-GO e avvia rollback.

## 6. Rollback

1. Mettere il frontend in maintenance e fermare nuove registrazioni.
2. Ridistribuire `<PREVIOUS_FRONTEND_ARTIFACT>` oppure usare lo switch atomico dell’hosting.
3. Disabilitare le due Edge Function o ridistribuire le versioni precedenti; ripristinare i secret/config snapshot solo dopo che non ricevono più traffico.
4. Eseguire, con approvazione del responsabile database:

```bash
psql '<SECURE_DATABASE_URL>' -v ON_ERROR_STOP=1 -f supabase/rollback/20260721090000_security_hardening_rollback.sql
```

5. Ripristinare la configurazione Auth precedente dal snapshot.
6. Verificare ritorno a 35 policy, 3 RLS disattivate e 91 grant anon.
7. Poiché il rollback SQL riapre vulnerabilità critiche, mantenere l’app in maintenance. Se sono stati creati utenti/inviti o modificati dati durante la finestra, preferire il ripristino completo dal backup/PITR concordato.

## 7. Signup legacy in emergenza

L’opzione più sicura è creare manualmente uno staff dalla Admin API/Dashboard e assegnare la venue con una procedura privilegiata auditata. Riattivare il vecchio signup è ultima risorsa e richiede approvazione esplicita.

Se imposto dal responsabile dell’incidente:

1. limitare temporaneamente l’accesso al frontend a operatori autorizzati;
2. completare il rollback database e frontend;
3. ruotare nuovamente il codice condiviso con un valore casuale temporaneo, comunicato una sola volta fuori banda;
4. abilitare signup diretto solo per la finestra strettamente necessaria;
5. creare esclusivamente utenti `staff`, verificare manualmente venue e profilo;
6. disabilitare subito signup diretto, invalidare il codice temporaneo e riapplicare l’hardening dopo nuovo preflight;
7. auditare tutti gli utenti creati durante la finestra.

Questa procedura riapre consapevolmente le vulnerabilità legacy ed è sempre uno stato NO-GO per traffico normale.

## 8. Decisione GO/NO-GO

**GO** soltanto con tutti i gate: backup ripristinabile, preflight interamente PASS, import Excel sicuro/disabilitato, commit approvato, 153/153 test locali, login esistente, CORS cloud ristretto, smoke multi-venue completo, log puliti e rollback pronto.

**NO-GO** per qualunque drift, anomalia dati, test fallito, wildcard CORS, segreto esposto, `xlsx@0.18.5` attivo, logout/login instabile, impossibilità di rollback o assenza di approvazione formale.
