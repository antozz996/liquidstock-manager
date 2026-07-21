# Dependency audit — Sprint 0.2

Audit eseguito il 21 luglio 2026 con `npm audit` e `npm audit --json` sul lockfile versionato.

## Stato iniziale

14 vulnerabilità: 10 high, 3 moderate, 1 low.

| Pacchetto iniziale | Diretto | Ambito e percorso | Advisory | Risoluzione applicata | Rischio regressione |
|---|---:|---|---|---|---|
| `@babel/core@7.29.0` | No | dev; plugin Vite/PWA → Workbox → Babel | GHSA-4x5r-pxfx-6jf8 | `7.29.7` | Basso, toolchain build; build PASS |
| `@babel/plugin-transform-modules-systemjs@7.29.0` | No | dev; PWA → Workbox → preset-env | GHSA-fv7c-fp4j-7gwp | `7.29.7` | Basso, usato in compilazione |
| `@rollup/plugin-terser@0.4.4` | No | dev; PWA → Workbox | dipendeva da `serialize-javascript` vulnerabile | `1.0.0` | Medio, cambio transitive major; output PWA verificato |
| `brace-expansion@1.1.14` e copie 2/5 | No | dev; ESLint, typescript-eslint, glob/filelist | GHSA-jxxr-4gwj-5jf2; GHSA-3jxr-9vmj-r5cp | `1.1.16`, `2.1.2`, `5.0.7` | Basso, glob di tooling |
| `dompurify@3.4.0` | No | runtime opzionale; `jspdf → dompurify` | GHSA-x4vx-rjvf-j5p4 e sette advisory correlate | `3.4.12` | Basso/medio, sanitizzazione PDF; build verificata |
| `fast-uri@3.1.0` | No | dev; PWA → Workbox → AJV | GHSA-q3j6-qgpj-74h6; GHSA-v39h-62p7-jpjc | `3.1.4` | Basso, validazione build-time |
| `js-yaml@4.1.1` | No | dev; ESLint → eslintrc | GHSA-h67p-54hq-rp68; GHSA-52cp-r559-cp3m | `4.3.0` | Basso, configurazione lint |
| `react-router@7.14.1` | No | runtime; `react-router-dom → react-router` | GHSA-49rj-9fvp-4h2h; GHSA-8x6r-g9mw-2r78; GHSA-84g9-w2xq-vcv6 | `7.18.1` | Medio, minor runtime; TypeScript/build e routing smoke da rieseguire in staging |
| `react-router-dom@7.14.1` | Sì | runtime frontend | eredita gli advisory di `react-router` | `7.18.1`, entro il range `^7.14.1` | Medio, routing applicativo |
| `serialize-javascript@6.0.2` | No | dev; PWA → Workbox → terser | GHSA-5c6j-r48x-rmvq; GHSA-qj8w-gfj5-8c6v | `7.0.7` | Medio, serializzazione build; bundle/PWA generati |
| `vite@6.4.2` | Sì | sviluppo/build | GHSA-v6wh-96g9-6wx3; GHSA-fx2h-pf6j-xcff | `6.4.3`, patch | Basso |
| `workbox-build@7.4.0` | No | dev; `vite-plugin-pwa → workbox-build` | eredita `serialize-javascript` | `7.4.1` | Basso/medio, service worker rigenerato |
| `ws@8.20.0` | No | runtime Node; Supabase realtime | GHSA-58qx-3vcg-4xpx; GHSA-96hv-2xvq-fx4p | `8.21.1` | Basso, patch; suite Supabase PASS |
| `xlsx@0.18.5` | Sì | runtime browser; `ImportModal` legge file Excel forniti dall’operatore | GHSA-4r6h-8v6p-xvw6; GHSA-5pgg-2g8v-p4x9 | Nessun fix disponibile dal pacchetto npm | Alto se sostituito senza test su import/template |

L’aggiornamento è stato eseguito con `npm audit fix`, senza `--force`. Non sono stati cambiati i range dichiarati in `package.json`; è stato aggiornato il lockfile entro le risoluzioni compatibili consentite.

## Stato finale

Al termine dello Sprint 0.2, `npm audit` riportava una vulnerabilità high residua, esclusivamente `xlsx@0.18.5`.

`xlsx` è realmente usato a runtime per interpretare file `.xlsx/.xls`, quindi non è classificabile come falso positivo o sola dipendenza di sviluppo. Il registry npm non offre una versione corretta. L’intervento proposto è uno sprint separato per:

1. valutare una distribuzione SheetJS mantenuta o una libreria alternativa;
2. limitare dimensione e provenienza dei file nel frattempo;
3. creare fixture per file corrotti, formule, range patologici e prototype pollution;
4. verificare import prodotti e generazione template prima della sostituzione.

Non è stato usato `npm audit fix --force`.

## Chiusura Sprint 0.4

L’importazione Excel è stata temporaneamente disabilitata, ogni import del parser è stato rimosso e `xlsx` è stato eliminato da `package.json` e `package-lock.json`.

- `npm ci`: PASS;
- `npm audit`: zero vulnerabilità;
- `npm audit --json`: 0 info, 0 low, 0 moderate, 0 high, 0 critical;
- nessun riferimento `xlsx` in `src`, lockfile, `node_modules` o bundle Vite.

Non è stato usato `npm audit fix --force`.
