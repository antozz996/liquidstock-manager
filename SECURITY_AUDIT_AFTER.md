# SECURITY AUDIT AFTER — Sprint 0 / 0.1

Stato verificato il 21 luglio 2026 esclusivamente su Supabase locale ricostruito dal dump schema-only ospitato. Nessuna modifica, funzione o configurazione è stata applicata al progetto ospitato.

## Risultato

- 15 tabelle applicative dopo `registration_invites` e `registration_rate_limits`; RLS attiva su tutte.
- 41 policy esplicite; zero policy con `USING (true)` o `WITH CHECK (true)`.
- Zero grant di tabella ad `anon` nello schema `public`.
- `configs`, inviti e contatori di rate limit non sono leggibili dal browser.
- Le funzioni `SECURITY DEFINER` fissano `search_path = ''`; le RPC interne di registrazione sono eseguibili solo da `service_role`.
- Ruolo e venue derivano da `profiles` e `venue_access`, non da JWT metadata o `localStorage`.
- `venue_id` è obbligatorio sulle tabelle operative; `restock_log.venue_id` viene derivato dal prodotto.
- Trigger bloccano cambi fraudolenti di ruolo/venue e riferimenti figli cross-venue.
- Signup diretto disabilitato; login email/password degli utenti esistenti abilitato.

## Registrazione con invito

- Token da 256 bit generato con `crypto.getRandomValues`, mostrato una sola volta e persistito solo come SHA-256.
- Scadenza massima 7 giorni, revoca, prenotazione di 5 minuti e consumo monouso con lock di riga.
- L’utente viene sempre creato `staff` nella venue dell’invito.
- Il trigger su `auth.users` crea profilo, crea `venue_access` e consuma l’invito nella transazione Auth: o avvengono tutte le operazioni o nessuna.
- `role`, `venue`, `venue_id`, `registration_code` e il marker tecnico di prenotazione vengono rimossi da `raw_user_meta_data`; token e segreti non vi entrano mai.
- Errori per email esistente, token assente/scaduto/revocato e invito già usato sono indistinguibili (`registration_unavailable`).
- Rate limit DB: 60 tentativi/IP, 5/email e 5/token ogni 15 minuti; decisione serializzata con advisory lock.

## Matrice RLS dopo

| Identità | Venue | Lettura | Scrittura |
|---|---|---|---|
| anon | nessuna | Nessuna tabella applicativa | Nessuna |
| authenticated senza accesso | nessuna | Solo il proprio profilo | Solo `full_name` del proprio profilo |
| staff | A | Dati operativi di A e profili condivisi | Serate, arrivi, report di chiusura, log e solo stock prodotto in A |
| admin | A | Dati e team di A | Gestione dati di A, report/edit log, inviti e rimozione accesso staff |
| super_admin | globale | Tutte le venue | Gestione globale di venue, profili e accessi |
| utente multi-venue | A+B | Solo A+B | Secondo il ruolo DB, solo in A+B |
| osservatore | venue assegnate | Lettura delle venue assegnate | Nessuna scrittura operativa |

## Test finali

- `supabase/tests/security_hardening.mjs`: **101/101 PASS**.
- `supabase/tests/registration_edge_cases.mjs`: **52/52 PASS**.
- Totale test automatici security/RLS/Edge: **153/153 PASS**.
- `supabase db lint --local`: PASS, zero errori.
- TypeScript + Vite production build collegato al Supabase locale: PASS; resta il warning del chunk JS > 500 kB.
- Browser Chrome headless: PASS per login, dashboard, prodotti, apertura/chiusura serata, arrivi, report/storico, analytics, team, registro attività, logout e venue multi-accesso con `localStorage` falsificato.
- ESLint: configurazione compatibile; l’analisi termina con 36 errori e 3 warning preesistenti, documentati nella consegna Sprint 0.2.

## Rollback e ripetibilità

- Rollback locale: PASS.
- Baseline ripristinata: 35 policy, 3 tabelle con RLS disattivata, 91 grant tabella ad anon.
- Migration riapplicata due volte consecutive: PASS.
- Stato finale: 41 policy, zero tabelle con RLS disattivata, zero grant tabella ad anon, zero policy aperte.

## Compatibilità e rischi residui

1. Il gateway Kong locale aggiunge `Access-Control-Allow-Origin: *` anche alle risposte delle funzioni. Le funzioni negano comunque l’origin non autorizzato prima di usare token o dati (test 403 PASS), ma l’header effettivo deve essere verificato sul gateway staging ed è un criterio no-go.
2. I prezzi prodotto restano leggibili dallo staff perché fanno parte della riga `products`; separarli richiede una vista/RPC dedicata.
3. Chiusura serata e arrivi fanno più chiamate client non atomiche; le RLS isolano i dati, ma un errore intermedio può lasciare stato parziale.
4. Il browser segnala una richiesta `/auth/v1/logout` abortita durante l’automazione, pur con sessione chiusa e secondo login riuscito. Va ricontrollata in staging con latenza reale.
5. Il blocker `xlsx@0.18.5` è chiuso nello Sprint 0.4: import Excel disabilitato, dipendenza e riferimenti bundle rimossi, `npm audit` a zero vulnerabilità.
6. ESLint raggiunge correttamente i sorgenti ma restano 36 errori e 3 warning legacy fuori dal perimetro del fix di configurazione.
7. Nessun preflight privilegiato è stato eseguito sui dati reali di produzione; è un gate obbligatorio.
8. `Price Sentinel` non è stato letto né modificato. Sprint 1 non è stato iniziato.

La configurazione Edge e l’analisi dei casi di errore sono in `SPRINT_0_1_PREPRODUCTION_REVIEW.md`; la procedura controllata è in `STAGING_RUNBOOK.md`.
