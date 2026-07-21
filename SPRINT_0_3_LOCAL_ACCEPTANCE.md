# Sprint 0.3 — Local staging acceptance

Data: 21 luglio 2026. Target esclusivo: Supabase locale `LIQUIDSTOCK`. Nessun comando è stato eseguito contro il progetto ospitato.

## Reset completo

1. Rollback dello stato locale precedente e creazione di una baseline schema-only senza dati.
2. `supabase stop --project-id LIQUIDSTOCK --no-backup`.
3. Verifica e rimozione controllata del volume locale residuo non utilizzato.
4. `supabase start` da volume nuovo, con migration temporaneamente esclusa per rispettare l’ordine baseline → hardening.
5. Caricamento della baseline `public` e dei grant legacy auditati.
6. Preflight read-only.
7. Applicazione hardening due volte.

Il primo tentativo di avvio ha dimostrato che la migration non può precedere la baseline (`public.products` assente). Un export creato con `--no-privileges` omette inoltre `USAGE ON SCHEMA public`; il grant baseline è stato ripristinato prima dei test. La procedura finale corretta ha prodotto:

| Stato | Policy | Tabelle RLS disattivata | Grant tabella anon | Policy aperte |
|---|---:|---:|---:|---:|
| Baseline | 35 | 3 | 91 | 9 |
| Hardening | 41 | 0 | 0 | 0 |

## Fixture sintetiche

Venue A, venue B, staff A, admin A, admin B, admin A+B, super_admin, staff A+B, staff B, autenticato senza accesso, prodotti A/B e inviti validi, scaduti e revocati. Nessun dato reale è stato caricato.

## Test

- RLS e flussi applicativi: **101/101 PASS**.
- Edge Function e fault/concorrenza: **52/52 PASS**.
- Totale automatico security: **153/153 PASS**.
- Build TypeScript/Vite/PWA con endpoint locale: PASS.
- `supabase db lint --local`: PASS, zero errori.
- Chrome headless: PASS per registrazione valida/scaduta/revocata, staff obbligatorio, login/logout, venue primaria e secondaria, localStorage falsificato, prodotti, serate, arrivi, report/storico, analytics, Team e activity log.
- Rollback: PASS, ritorno a `35/3/91`.
- Riapplicazione: PASS, ritorno a `41/0/0`; le suite finali passano nuovamente 101/101 e 52/52.
- Preflight produzione sulla baseline sintetica: **39/39 controlli dati PASS** e **7/7 controlli impronta PASS**; transazione read-only conclusa con rollback.

Il test browser ha individuato e corretto la perdita del messaggio d’errore nella registrazione: il loader globale smontava la pagina. `registerWithInvite` usa ora soltanto lo stato locale `isValidating` già presente nella pagina.

## Edge e CORS locale

- JWT assente/invalido per creazione invito: negato.
- Autorizzazione admin/super_admin e venue: verificata nel database.
- Token hash-only, scadenza, revoca, monouso, concorrenza e rate limit: PASS.
- Payload `role`/`venue_id`: negato; nuovo utente sempre staff nella venue invito.
- Errori generici e cleanup transazionale: PASS.
- Scansione log Edge: zero pattern JWT, password, token JSON o nomi dei secret custom.
- POST da origin non autorizzato: funzione risponde 403 prima della logica.

Kong locale aggiunge tuttavia `Access-Control-Allow-Origin: *`, e intercetta OPTIONS con 200 permissivo. Questo comportamento del gateway locale non certifica quello cloud. Gli header del gateway cloud devono essere verificati durante il rilascio controllato e un wildcard è criterio NO-GO.

## Evidenze residue browser

Le risposte 400 previste per inviti scaduti/revocati compaiono come errori console. Chrome segnala inoltre `net::ERR_ABORTED` sulla richiesta logout globale, pur con sessione rimossa e login successivo funzionante.

## Bonifica legacy

Commit locale separato `7557086bd4881bee88cdec97be1ad6909bcd7709` (`security: remove legacy registration secrets`): rimossi anon key/URL hardcoded, vecchio codice condiviso e istruzioni per policy aperte dai due script `scratch/`. Il codice condiviso era stato introdotto dal commit storico `3b8ef5f2108169e501cb68c1ffdc2f6ba887a975`; la cronologia non è stata riscritta.

## Decisione attuale

**NO-GO oggi per la produzione**: il preflight privilegiato sui dati reali non è stato eseguito, il CORS del gateway cloud non è certificabile localmente e l’import `xlsx@0.18.5` vulnerabile è ancora abilitato. Il passaggio a GO richiede tutti i gate di `PRODUCTION_RELEASE_PACKAGE.md`.
