# SECURITY AUDIT BEFORE — Sprint 0

Audit eseguito il 21 luglio 2026 sul dump schema-only ospitato `.tmp/hosted_schema.sql` e, per i soli conteggi aggregati consentiti dalla chiave pubblica, sul Data API ospitato in sola lettura.

## Integrità e perimetro

- SHA-256 dump: `f9a5480724fd70dd4aa5f1b447fd5e28520319cc42a2bd997b28c8d3dbf32c46`.
- 13 tabelle applicative in `public`, 35 policy, 371 istruzioni `GRANT`.
- 9 trigger di riga dichiarati con `CREATE TRIGGER` e 6 event trigger di sistema.
- 5 funzioni applicative; 4 sono `SECURITY DEFINER`.
- Il dump non contiene dati, `COPY FROM stdin` o sezioni `Data for Name`.
- Il dump è rimasto in `.tmp` ed è escluso da Git.

## Vulnerabilità critiche confermate

1. Tutte le 13 tabelle `public` concedono `ALL` ad `anon`, `authenticated` e `service_role`.
2. RLS è disattivata su `profiles`, `restock_items` e `restock_sessions`, nonostante esistano policy definite. Con i grant correnti, anon può leggere e modificare direttamente queste tabelle.
3. Nove policy hanno `USING (true)`. Cinque sono policy `ALL` e consentono operazioni anonime su `products`, `events`, `reports`, `report_edit_log` e `restock_log`.
4. `profiles` è anonimamente modificabile. Un anon può alterare `role`/`venue_id`; la cancellazione di un profilo attiva inoltre `handle_user_delete`, che elimina il corrispondente utente Auth.
5. `configs` espone anonimamente `registration_code` mediante due policy permissive. Il codice condiviso è quindi leggibile dal browser e riutilizzabile.
6. `handle_new_user` accetta `role` e `venue_id` da `auth.users.raw_user_meta_data`. Il frontend permette anche `r=admin` nell’URL: un client può richiedere privilegi e venue arbitrari.
7. `venues`, `profiles`, prodotti, eventi, report, righe evento e righe arrivo espongono dati reali senza login.
8. Le policy figlie di `event_stocks` dipendono da `events`, ma `events` è aperta; l’isolamento ereditato è quindi inefficace.
9. `venue_access` ha RLS attiva ma nessuna policy: il selettore venue frontend dipende da una tabella che il client autenticato non può leggere in modo affidabile.
10. Il frontend considera attendibili `selectedRole` e `selectedVenueId` da `localStorage`. Il ruolo falsificato controlla l’interfaccia; la venue falsificata viene usata nei filtri client.
11. `restock_log` non contiene `venue_id` nello schema ospitato, mentre il frontend prova a inserirlo. Oltre all’errore funzionale, l’isolamento può avvenire solo tramite il prodotto padre.
12. Le quattro funzioni `SECURITY DEFINER` sono concesse anche ad `anon` e `authenticated`; tre non fissano un `search_path` sicuro.
13. `SurgicalSetup` consente una registrazione admin dal browser e replica il problema dei metadata controllati dal client.

## Policy ospitate: inventario esatto

| Tabella | Policy | Esposizione/rischio |
|---|---|---|
| configs | Admin local access; Admin può aggiornare configs; Admin può inserire configs; Lettura libera configs; Public registration code access; Super admin full access | Lettura anon completa; codice registrazione pubblico |
| profiles | Aggiornamento Profili; Aggiornamento profilo personale; Cancellazione Profili; Inserimento profilo personale; Permetti aggiornamento profilo ai responsabili; Profili visibili a tutti; Sblocco Totale; Super Admin Full Access; Super Admin Power; Visualizzazione Profili | RLS disattivata; `ALL` grant rende le policy irrilevanti |
| report_edit_log | Allow All on EditLogs | `ALL USING (true)` |
| events | Allow All on Events; Modifica Eventi per Locale; Visualizzazione Eventi per Locale | Policy aperta annulla isolamento venue |
| products | Allow All on Products; Modifica Prodotti per Locale; Visualizzazione Prodotti per Locale | Policy aperta annulla isolamento venue |
| reports | Allow All on Reports; Modifica Report per Locale; Visualizzazione Report per Locale | Policy aperta annulla isolamento venue |
| restock_log | Allow All on Restock | `ALL USING (true)` |
| restock_items | Isolamento Articoli Arrivi per Locale | RLS disattivata |
| event_stocks | Isolamento Event Stocks per Locale | Parent `events` aperto |
| activity_log | Isolamento Log per Locale | Non visibile anon; dipende da accessi DB |
| restock_sessions | Modifica Sessioni Arrivi per Locale; Visualizzazione Sessioni Arrivi per Locale | RLS disattivata |
| venues | Venues are manageable by super admins; Venues are readable by authenticated users; Venues are readable by everyone | Lettura anon completa |
| venue_access | nessuna | Deny per Data API, incompatibile con il frontend esistente |

## Verifica anon in sola lettura sul sistema ospitato

| Tabella | Righe enumerabili da anon |
|---|---:|
| venues | 2 |
| profiles | 5 |
| configs | 2 |
| products | 86 |
| events | 6 |
| event_stocks | 240 |
| reports | 6 |
| restock_sessions | 5 |
| restock_items | 54 |
| activity_log | 0 |
| restock_log | 0 |
| report_edit_log | 0 |
| venue_access | 0 visibili; il valore reale non è inferibile perché manca una policy |

Tra i record visibili risultano: zero `venue_id` nulli su profili, prodotti, eventi, report e sessioni arrivo; zero riferimenti orfani o cross-venue tra report/eventi, stock evento/prodotti e articoli arrivo/sessioni/prodotti.

## Preflight non determinabili con credenziale anon

Il dump è schema-only e la credenziale disponibile è anonima. Non è quindi possibile certificare sul database ospitato i conteggi di:

- utenti Auth senza profilo;
- profili non-super senza `venue_access` coerente;
- righe `venue_access` nulle o duplicate;
- orfani rispetto ad `auth.users` non esposti dal Data API.

Questi controlli sono presenti in `supabase/audit/preflight_security_hardening.sql` e nei controlli bloccanti della migration. Devono produrre zero anomalie mediante una sessione privilegiata **read-only** prima di qualunque applicazione futura in produzione.

## Matrice RLS prima

| Identità | Accesso effettivo prima |
|---|---|
| anon | R/W su profiles, products, events, event_stocks, reports, report_edit_log, restock_log, restock_sessions e restock_items; R su configs e venues |
| authenticated senza accesso | Può leggere dati globali e usare le policy aperte; nessun isolamento affidabile |
| staff/admin | Diverse policy nominali, ma sovrascritte dalle policy permissive |
| super_admin | Accesso globale intenzionale, ottenibile però anche tramite metadata client nello signup |
| multi-venue | Modello `venue_access` presente ma non applicato coerentemente a tutte le tabelle |
