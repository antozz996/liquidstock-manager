# XLSX security review — Sprint 0.3

## Perimetro e utilizzo

`xlsx@0.18.5` è importato direttamente da `src/components/ImportModal.tsx` ed entra nel bundle browser. È usato per:

- `XLSX.read` del file selezionato;
- `XLSX.utils.sheet_to_json` del primo foglio;
- generazione e download del template con `aoa_to_sheet` e `writeFile`.

L’upload UI è visibile solo a `admin` e `super_admin`. L’inserimento finale è comunque verificato dalle RLS, ma il parsing avviene prima, nel browser privilegiato. I file sono scelti dal filesystem dell’operatore; il codice non garantisce che siano prodotti internamente. Un file ricevuto da fornitore, email o messaggistica deve quindi essere considerato non attendibile.

## Controlli attuali

| Controllo | Stato |
|---|---|
| Estensione | Solo hint browser `accept=".xlsx, .xls"`; aggirabile e non ricontrollato in JavaScript |
| MIME | Nessuna verifica di `File.type` e nessun content sniffing |
| Dimensione file | Nessun limite |
| Numero fogli | Viene elaborato il primo, ma l’intero workbook è parsato |
| Numero righe | Nessun limite; tutte le righe sono materializzate prima dell’anteprima |
| Numero colonne/celle | Nessun limite |
| Formule/link/contenuti anomali | Nessuna validazione preventiva |
| Parsing | Sincrono sul main thread tramite `readAsBinaryString` |
| Anteprima | Solo 20 righe visualizzate, ma tutte le righe restano in memoria |
| Sanitizzazione output | React effettua escaping testuale; costo e soglia sono convertiti a numero |

## Rischio concreto

Le advisory residue sono prototype pollution e ReDoS. Nel flusso corrente il rischio più immediato è denial of service del browser: file grandi o costruiti ad arte possono consumare CPU/memoria e bloccare la sessione dell’admin. La prototype pollution può alterare oggetti e logica nella pagina privilegiata; il mapping riduce l’output persistito a campi noti, ma non protegge la fase di parsing vulnerabile. Non è stata dimostrata esecuzione di codice remoto e React riduce il rischio XSS nell’anteprima, ma ciò non rende sicuro il parser.

## Decisione iniziale

**NO-GO per la produzione con import Excel abilitato.** `npm audit` non offre una correzione compatibile e `--force` non deve essere usato.

Per rendere possibile il GO occorre una delle seguenti opzioni:

1. disabilitare temporaneamente il pulsante/import e rimuovere `xlsx` dal bundle di produzione; oppure
2. sostituire il parser con una libreria mantenuta e verificata, aggiungendo fixture malevole e test di regressione.

Anche con una libreria aggiornata vanno aggiunti almeno: limite file 2 MiB, massimo 2.000 righe, massimo 50 colonne, verifica combinata estensione/MIME/magic bytes, parsing in Web Worker, rifiuto di workbook senza primo foglio valido e conferma esplicita prima dell’inserimento. Questi valori sono una proposta di sicurezza, non limiti attualmente implementati.

## Chiusura Sprint 0.4

Il blocker è stato chiuso disabilitando temporaneamente l’interfaccia operativa:

- nessun file input o parsing workbook;
- messaggio UI “Importazione Excel temporaneamente non disponibile”;
- nessun import `xlsx` nei sorgenti;
- dipendenza rimossa da manifest e lockfile;
- nessun modulo o testo `xlsx` nel bundle;
- `npm audit` e JSON: zero vulnerabilità.

L’import manuale dei prodotti resta disponibile. Non esisteva un import CSV separato da preservare. Il parser Excel non è stato sostituito in questo sprint.
