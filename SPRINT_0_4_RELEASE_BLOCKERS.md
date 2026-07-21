# Sprint 0.4 — Chiusura release blocker

Nessuno dei comandi di produzione contenuti in questo documento è stato eseguito.

## Preflight produzione con PostgreSQL 17

Prerequisiti: Docker disponibile, repository posizionato sul commit approvato, host e username PostgreSQL recuperati personalmente dal Dashboard Supabase. Non comunicare password o connection string in chat.

1. Dalla root del repository verificare che `.tmp` sia ignorata:

```bash
git check-ignore .tmp/production_preflight.txt
```

2. Verificare il client PostgreSQL 17:

```bash
docker run --rm postgres:17 psql --version
```

3. Sostituire esclusivamente `<PRODUCTION_DB_HOST>` e `<PRODUCTION_DB_USER>`, quindi eseguire personalmente:

```bash
docker run --rm -it \
  -e PGSSLMODE=require \
  -v "$PWD/supabase/audit/preflight_security_hardening.sql:/work/preflight.sql:ro" \
  -v "$PWD/.tmp:/work/output" \
  postgres:17 \
  psql -X -W \
    --host='<PRODUCTION_DB_HOST>' \
    --port=5432 \
    --username='<PRODUCTION_DB_USER>' \
    --dbname=postgres \
    --set=ON_ERROR_STOP=1 \
    --file=/work/preflight.sql \
    --output=/work/output/production_preflight.txt
```

`-W` mostra il prompt password interattivo; la password non compare nel comando. Lo script apre `BEGIN TRANSACTION READ ONLY`, esegue solo SELECT e termina con `ROLLBACK`. L’output resta in `.tmp/production_preflight.txt`.

4. Controllare exit code `0`, presenza iniziale di `BEGIN`, finale `ROLLBACK` e che tutte le righe `release_status` siano `PASS`. Qualunque `STOP`, errore o output incompleto blocca il rilascio. Non eseguire migration o correzioni dati.

## Edge Function temporanea `cors-probe`

File:

- `supabase/functions/cors-probe/index.ts`;
- `supabase/functions/_shared/http.ts` riusato senza modifiche specifiche;
- `supabase/config.toml`, con `verify_jwt=false` solo per la probe statica.

La funzione non crea client Supabase, non usa database, service role o secret applicativi. Legge soltanto `ALLOWED_ORIGINS` attraverso l’helper condiviso e restituisce `{ "ok": true, "probe": "cors" }`.

Secret/config necessario, già richiesto dalle funzioni definitive:

```text
ALLOWED_ORIGINS=<EXACT_PRODUCTION_FRONTEND_ORIGIN>
```

Configurarlo dal Dashboard senza wildcard e senza slash finale. Nessun altro secret è necessario.

Deploy preparato, da non eseguire senza autorizzazione:

```bash
supabase functions deploy cors-probe \
  --project-ref <PRODUCTION_PROJECT_REF> \
  --no-verify-jwt
```

Test origin autorizzato:

```bash
curl -i -X OPTIONS 'https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/cors-probe' \
  -H 'Origin: <EXACT_PRODUCTION_FRONTEND_ORIGIN>' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'

curl -i -X POST 'https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/cors-probe' \
  -H 'Origin: <EXACT_PRODUCTION_FRONTEND_ORIGIN>' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Test origin non autorizzato:

```bash
curl -i -X OPTIONS 'https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/cors-probe' \
  -H 'Origin: https://unauthorized.invalid' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'

curl -i -X POST 'https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/cors-probe' \
  -H 'Origin: https://unauthorized.invalid' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

GO CORS solo se l’origin autorizzato è riflesso esattamente, l’origin non autorizzato è rifiutato e nessuna risposta contiene `Access-Control-Allow-Origin: *`.

Eliminazione dopo il test:

```bash
supabase functions delete cors-probe --project-ref <PRODUCTION_PROJECT_REF>
```

## Rotazione legacy immediatamente prima della migration

Script preparato: `supabase/release/rotate_legacy_registration_code.sql`.

Procedura:

1. entrare nella finestra di manutenzione e impedire l’uso del vecchio frontend/signup;
2. verificare backup e che il preflight iniziale contenga esclusivamente gli STOP dati approvati;
3. eseguire la remediation unica; lo script di sola rotazione resta idempotente per il caso in cui gli accessi siano già completi;
4. verificare che `registration_code_rows_invalidated` coincida con le righe legacy attive e che il numero totale di righe `configs` resti invariato; una riga per venue è legittima e nessun valore viene restituito;
5. rieseguire il preflight, richiedere solo `PASS` e applicare immediatamente la migration di hardening;
6. verificare signup diretto disabilitato, `configs` non leggibile da anon/authenticated e payload legacy role/venue ignorati;
7. se la migration non parte o fallisce, mantenere maintenance mode: non riattivare il vecchio signup con il valore precedente.

Il valore è generato nel database con 256 bit casuali e non è noto al frontend, al terminale o ai log applicativi. La breve distanza fra rotazione e migration richiede maintenance mode perché le policy legacy rendono ancora leggibile `configs` fino al commit dell’hardening.

## ESLint mirato

Per controllare soltanto file TypeScript/TSX modificati rispetto a `main`:

```bash
git diff --name-only --diff-filter=ACMR main...HEAD -- '*.ts' '*.tsx' \
  | xargs --no-run-if-empty ./node_modules/.bin/eslint --max-warnings=0
```

Prima del commit, quando le modifiche sono ancora nel working tree, usare:

```bash
{
  git diff --name-only --diff-filter=ACMR HEAD -- '*.ts' '*.tsx'
  git ls-files --others --exclude-standard -- '*.ts' '*.tsx'
} | sort -u | xargs --no-run-if-empty ./node_modules/.bin/eslint --max-warnings=0
```

Se il lint segnala una regola legacy in un file toccato, confrontare lo stesso file dalla base senza modificare il working tree, per esempio:

```bash
git show main:src/store/useAuthStore.ts \
  | ./node_modules/.bin/eslint --stdin --stdin-filename src/store/useAuthStore.ts
```

Nel checkpoint Sprint 0.4 il file corrente e la versione `main` riportano gli stessi due `no-explicit-any` legacy alle firme dell’interfaccia; ImportModal, Products e `cors-probe` non introducono errori.

## Risultati locali Sprint 0.4

- branch: `security/hardening-sprint0`;
- `npm ci`: PASS;
- `npm audit`: zero vulnerabilità;
- `npm audit --json`: zero vulnerabilità a ogni livello;
- TypeScript `tsc -b`: PASS;
- build Vite/PWA: PASS;
- ricerca case-insensitive in `src`, `dist`, manifest, lockfile e `node_modules`: nessun `xlsx`;
- chunk principale ridotto da circa 1.853 kB a circa 1.419 kB;
- `cors-probe` locale: POST autorizzato 200 con JSON statico; POST non autorizzato 403;
- Kong locale continua ad aggiungere wildcard e intercettare OPTIONS, quindi non certifica il gateway cloud.

## Valutazione aggiornata

Il blocker `xlsx` è chiuso. Lo stato complessivo resta **NO-GO fino all’esecuzione personale del preflight produzione e al test cloud isolato di `cors-probe`**. Se entrambi risultano interamente conformi, senza drift, wildcard o anomalie dati, e restano soddisfatti gli altri gate del pacchetto, la valutazione può passare a GO per la finestra controllata.
