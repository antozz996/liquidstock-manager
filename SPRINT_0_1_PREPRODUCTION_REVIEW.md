# Sprint 0.1 — Pre-production review

## Edge Function: `create-registration-invite`

- `verify_jwt = true`: il gateway rifiuta richieste senza JWT; la funzione valida nuovamente il bearer token tramite `/auth/v1/user`.
- La funzione non legge `role` o venue dai metadata. Passa l’ID Auth verificato alla RPC service-only `create_registration_invite_record`.
- La RPC legge `profiles.role` nel database: solo `admin` e `super_admin`; un admin deve avere la venue in `venue_access`, un super admin può operare globalmente.
- Il token è composto da 32 byte casuali, codificato base64url. Il database riceve solo SHA-256.
- Massimo 20 inviti per creatore/ora, con advisory lock contro richieste parallele.
- La risposta di creazione contiene solo `id`, token appena creato ed `expires_at`; la revoca restituisce solo un booleano. Nessun log applicativo contiene token o chiavi.
- Il controllo CORS è condiviso e fail-closed: l’origin browser deve essere nell’elenco `ALLOWED_ORIGINS`.

## Edge Function: `register-with-invite`

- `verify_jwt = false` perché l’utente non possiede ancora un account. La sicurezza deriva da token monouso, hash, scadenza/revoca, rate limit e RPC accessibili solo alla service role.
- Payload ammesso: `token`, `email`, `password`, `full_name`. La presenza di `role`, `venue` o `venue_id` produce `invalid_request` prima della prenotazione.
- Token, email e IP sono usati solo in memoria; il token è trasformato in SHA-256, email/IP in hash con pepper. Non vengono registrati.
- `begin_registration_invite` usa `SELECT ... FOR UPDATE`, crea una prenotazione UUID di 5 minuti e consente un solo vincitore concorrente.
- L’Auth admin endpoint riceve solo `full_name` e il marker non segreto `registration_attempt_id`; non riceve ruolo o venue.
- Il trigger Auth usa il marker per creare un profilo `staff`, inserire l’accesso alla venue dell’invito e consumare l’invito nella stessa transazione dell’utente Auth.
- Trigger dedicati rimuovono marker, vecchio codice, ruolo e venue dai metadata anche quando GoTrue li riscrive dopo l’insert.
- La service role key esiste solo nell’ambiente Edge, non nel bundle frontend, nelle risposte o nei log applicativi.

## Atomicità: casi verificati

1. **Auth creato, profilo fallito.** Il trigger `AFTER INSERT` appartiene alla transazione Auth. L’eccezione annulla `auth.users`; la funzione rilascia la prenotazione. Test con fault injection: nessun Auth user e nessun profilo.
2. **Profilo creato, `venue_access` fallito.** L’eccezione annulla accesso, profilo, consumo invito e Auth user. La prenotazione viene rilasciata. Test con fault injection: nessun orfano.
3. **Due registrazioni simultanee con lo stesso token.** Il lock di riga concede una sola prenotazione; una risposta è 201, l’altra generica 400; esiste un solo Auth user.
4. **Email già registrata.** Auth rifiuta la creazione; l’Edge restituisce solo `registration_unavailable` e libera la prenotazione. L’invito resta utilizzabile con un’altra email.
5. **Funzione interrotta dopo la creazione Auth.** Se il commit Auth è avvenuto, trigger, profilo, accesso, consumo e pulizia metadata sono già completi. Se non è avvenuto, l’intera transazione è assente; una prenotazione non rilasciata scade dopo 5 minuti. Non esiste uno stato Auth-only.
6. **Invito scaduto o revocato.** La prenotazione è negata sotto lock e la risposta non distingue stato o esistenza dell’invito.
7. **Tentativo di cambiare ruolo o venue.** Il payload è rifiutato; anche metadata fraudolenti sono ignorati e rimossi. Il database assegna sempre `staff` e la venue dell’invito.

## Configurazione esatta

| Funzione | `verify_jwt` | Motivo |
|---|---:|---|
| `create-registration-invite` | `true` | Operazione amministrativa di utente già autenticato; resta anche la verifica DB di ruolo/venue. |
| `register-with-invite` | `false` | Endpoint pre-login; il token monouso è la credenziale e tutte le RPC interne sono service-only. |

Segreti/variabili runtime:

- forniti da Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
- da configurare nel secret store: `ALLOWED_ORIGINS` e `REGISTRATION_RATE_LIMIT_PEPPER`;
- `ALLOWED_ORIGINS` è una lista separata da virgole di origin esatti, senza slash finale e senza `*`;
- il pepper deve essere casuale, distinto per ambiente e conservato fuori da Git;
- non servono né sono ammessi segreti `VITE_*` oltre alla normale chiave pubblica anon/publishable.

Auth:

- `[auth] enable_signup = false` disabilita signup diretto, anonimo e dal browser;
- `[auth.email] enable_signup = true` mantiene il provider email/password: gli utenti esistenti continuano a fare login e la Admin API service-role può creare gli invitati;
- `enable_anonymous_sign_ins = false` resta disabilitato;
- la promozione `staff → admin` si esegue solo da un super admin autenticato nella pagina Gestione Utenti, dopo aver assegnato le venue necessarie. RLS e trigger rifiutano la stessa modifica da staff/admin o da metadata.

Origin consigliati:

- staging: solo l’origin HTTPS esatto del frontend staging e gli eventuali origin preview esplicitamente approvati;
- produzione futura: solo l’origin HTTPS esatto di LiquidStock in produzione;
- localhost è ammesso solo nell’ambiente locale. Ogni modifica della lista richiede riesecuzione test CORS.

## Evidenze automatiche

- 101 test RLS/applicativi: PASS, inclusi admin venue B, Team su venue primaria/secondaria e isolamento multi-venue.
- 52 test Edge/atomicità: PASS.
- Casi inclusi: JWT assente/invalido, staff negato, admin cross-venue negato, super admin, metadata spoof, CORS, concorrenza, email esistente, fault profile/accesso, interruzione, revoca/scadenza, rate limit e hash-only.
