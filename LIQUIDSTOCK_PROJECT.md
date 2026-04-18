# LiquidStock Manager — PROJECT CONTEXT

## 1. Overview

**App Name:** LiquidStock Manager
**Type:** Progressive Web App (PWA) — Mobile First
**Domain:** Gestione inventario alcolici in contesto discoteca / eventi
**Target User:** Bar manager / responsabile magazzino che opera da smartphone durante apertura e chiusura serata
**Auth Model:** Single-user o multi-user base via Supabase Auth (email/password)

---

## 2. Core Concept

L'app non traccia le singole vendite in tempo reale.
Opera esclusivamente sul **delta tra giacenza iniziale e giacenza finale** di ogni evento.

```
Consumato = Giacenza_Inizio - Giacenza_Fine
Valore_Costo = Consumato × cost_price
Ricavo_Stimato = Consumato × selling_price
```

---

## 3. User Workflow (Step-by-Step)

### Step 1 — Apertura Evento (Initial Stock)
- L'utente avvia una nuova serata
- Il sistema pre-carica le quantità dalla `current_stock` del database (giacenza attuale)
- L'utente può modificare manualmente ogni quantità (es. dopo un rifornimento notturno)
- Conferma: snapshot salvato come `initial_stock` dell'evento

### Step 2 — Chiusura Evento (Final Stock)
- A fine serata, l'utente inserisce le quantità fisiche rimanenti per ogni prodotto
- Input numerico grande, ottimizzato per touch
- Conferma: snapshot salvato come `final_stock` dell'evento

### Step 3 — Report Generato
- Il sistema calcola il delta prodotto per prodotto
- Genera un riepilogo con: consumato, valore a costo, ricavo stimato, margine
- Il report viene salvato su `reports` table con `details_json`

### Step 4 — Aggiornamento Stock
- La `Giacenza_Fine` dell'evento diventa automaticamente la nuova `current_stock` nel database
- Nessuna azione manuale richiesta

### Step 5 — Restock (opzionale, in qualsiasi momento)
- L'utente può aggiungere unità a `current_stock` di uno o più prodotti
- Funzione accessibile dalla schermata prodotti
- Log dell'operazione con timestamp

---

## 4. Data Schema

### Table: `products`
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
name          TEXT NOT NULL
category      TEXT NOT NULL          -- es. 'Spirits', 'Beer', 'Wine', 'Mixer'
unit          TEXT DEFAULT 'bottle'  -- es. 'bottle', 'can', 'keg'
cost_price    NUMERIC(10,2) NOT NULL -- prezzo d'acquisto unitario
selling_price NUMERIC(10,2) NOT NULL -- prezzo di vendita unitario
current_stock NUMERIC(10,2) DEFAULT 0
min_threshold NUMERIC(10,2) DEFAULT 0 -- soglia minima per reorder; 0 = non monitorato
created_at    TIMESTAMPTZ DEFAULT NOW()
updated_at    TIMESTAMPTZ DEFAULT NOW()
is_active     BOOLEAN DEFAULT TRUE
```

### Table: `events`
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
name              TEXT                          -- es. "Sabato 14 Giugno"
date              DATE NOT NULL
status            TEXT DEFAULT 'open'           -- 'open' | 'closed'
created_at        TIMESTAMPTZ DEFAULT NOW()
closed_at         TIMESTAMPTZ
is_editable_until TIMESTAMPTZ                   -- closed_at + 96h; NULL se ancora aperto
```

### Table: `event_stocks`
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
event_id          UUID REFERENCES events(id) ON DELETE CASCADE
product_id        UUID REFERENCES products(id)
initial_qty       NUMERIC(10,2) NOT NULL
final_qty         NUMERIC(10,2)            -- NULL finché non chiuso
consumed          NUMERIC(10,2)            -- calcolato a chiusura
cost_value        NUMERIC(10,2)            -- consumed × cost_price
rev_value         NUMERIC(10,2)            -- consumed × selling_price
stock_value_cost  NUMERIC(10,2)            -- final_qty × cost_price (valore magazzino residuo a costo)
stock_value_sell  NUMERIC(10,2)            -- final_qty × selling_price (valore potenziale di vendita residuo)
```

### Table: `reports`
```sql
id                        UUID PRIMARY KEY DEFAULT gen_random_uuid()
event_id                  UUID REFERENCES events(id)
generated_at              TIMESTAMPTZ DEFAULT NOW()
total_cost_consumed       NUMERIC(10,2)
total_revenue_est         NUMERIC(10,2)
total_margin              NUMERIC(10,2)
total_stock_value_cost    NUMERIC(10,2)  -- somma final_qty × cost_price su tutti i prodotti
total_stock_value_sell    NUMERIC(10,2)  -- somma final_qty × selling_price su tutti i prodotti
details_json              JSONB          -- array di righe prodotto con tutti i valori
```

### Table: `restock_log`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
product_id  UUID REFERENCES products(id)
qty_added   NUMERIC(10,2) NOT NULL
note        TEXT
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### Table: `report_edit_log`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
report_id       UUID REFERENCES reports(id) ON DELETE CASCADE
edited_at       TIMESTAMPTZ DEFAULT NOW()
edited_by       UUID REFERENCES auth.users(id)
field_changed   TEXT NOT NULL        -- 'final_qty' + product_id come stringa
old_value       NUMERIC(10,2)
new_value       NUMERIC(10,2)
note            TEXT                 -- motivazione opzionale della correzione
snapshot_before JSONB                -- details_json prima della modifica
snapshot_after  JSONB                -- details_json dopo la modifica
```

---

## 5. Feature Requirements

### 5.1 Product Management
- CRUD completo prodotti (nome, categoria, unità, prezzi, stock iniziale)
- Toggle `is_active` per nascondere prodotti fuori uso senza cancellarli
- Filtro/ricerca per categoria

### 5.2 Event Management
- Creazione nuova serata (con nome e data)
- Un solo evento alla volta può essere in stato `open`
- Lista eventi passati (storico)

### 5.3 Initial Stock (Apertura)
- Lista scrollabile di tutti i prodotti attivi
- Quantità pre-popolata da `current_stock`
- Input numerico grande (tasto `-` / `+` o campo diretto)
- Pulsante "Conferma Apertura" → salva snapshot su `event_stocks`

### 5.4 Final Stock (Chiusura)
- Stessa lista con quantità iniziali visibili (read-only, riferimento)
- Campo input finale per ogni prodotto
- Preview del consumato in tempo reale mentre l'utente digita
- Pulsante "Chiudi Serata" → calcola, salva report, aggiorna `current_stock`

### 5.5 Report View
- Riepilogo testata: data evento, totale costo consumato, ricavo stimato, margine lordo
- Tabella dettaglio per prodotto: quantità iniziale, finale, consumata, valore costo, valore ricavo
- Ordinabile per consumato o valore
- Export opzionale: copia testo o screenshot-friendly layout

### 5.6 History
- Lista eventi chiusi ordinata per data decrescente
- Tap su un evento → visualizza il report relativo (read-only)

### 5.7 Restock
- Selezione prodotto + inserimento quantità aggiunta
- Aggiornamento immediato di `current_stock`
- Registrazione su `restock_log`

### 5.9 PDF Export — Report Giacenza & Consumato
- Disponibile da qualsiasi report chiuso (anche in History)
- Genera un PDF con:
  - **Header:** nome venue, data evento, data/ora generazione
  - **Sezione Giacenze:** tabella con giacenza iniziale, finale e consumato per prodotto (raggruppata per categoria)
  - **Sezione Valore Giacenza:** per ogni prodotto → `final_qty × cost_price` (valore a costo del rimanente) e `final_qty × selling_price` (valore potenziale di vendita del rimanente); totali di colonna in fondo
  - **Sezione Costi:** consumato × costo acquisto per prodotto + totale
  - **Sezione Ricavi Stimati:** consumato × prezzo vendita per prodotto + totale
  - **Footer:** margine lordo stimato, valore totale magazzino residuo a costo, eventuale nota "Report modificato il [data]" se ha subito Soft Edit
- Generazione lato client via libreria `jsPDF + jspdf-autotable` — nessuna chiamata backend
- Pulsante "Scarica PDF" → download diretto su mobile (`<a download>`)
- Layout ottimizzato per stampa A4

### 5.10 Reorder PDF — Ordine di Acquisto per Soglia Minima
- Accessibile dalla schermata Prodotti → pulsante "Genera Ordine"
- **Configurazione soglia:** ogni prodotto ha un campo `min_threshold` (quantità minima desiderata a magazzino)
- L'utente può impostare la soglia per singolo prodotto nella scheda prodotto, oppure in bulk dalla lista
- **Calcolo ordine:**
  ```
  qty_to_order = max(0, min_threshold - current_stock)
  order_cost   = qty_to_order × cost_price
  ```
- Vengono inclusi solo i prodotti con `qty_to_order > 0` e `is_active = true`
- **PDF generato contiene:**
  - Header: "Ordine di Acquisto" + data generazione
  - Tabella prodotti da ordinare: nome, categoria, stock attuale, soglia, quantità da ordinare, costo unitario, costo totale riga
  - Totale ordine stimato in fondo
  - Raggruppamento opzionale per categoria (es. Spirits, Beer, Wine, Mixer)
- Generazione lato client, download diretto
- **Anteprima interattiva** prima del download: l'utente può deselezionare singoli prodotti dall'ordine o modificare manualmente la `qty_to_order` (override una-tantum, senza persistenza)

- Disponibile solo se `NOW() < is_editable_until` (entro 96 ore dalla chiusura)
- Nella schermata Report, mostra un pulsante "Correggi Giacenze" visibile solo nella finestra temporale
- L'utente può modificare la `final_qty` di uno o più prodotti
- Campo nota obbligatorio (motivazione della correzione, min 3 caratteri)
- Al salvataggio, in una singola transazione:
  1. Ricalcola `consumed`, `cost_value`, `rev_value` per i prodotti modificati in `event_stocks`
  2. Aggiorna i totali su `reports` (`total_cost_consumed`, `total_revenue_est`, `total_margin`, `details_json`)
  3. Aggiorna `current_stock` dei prodotti impattati (delta tra vecchia e nuova `final_qty`)
  4. Scrive una riga su `report_edit_log` con snapshot prima/dopo
- Badge "Modificato" visibile sul report in History se ha subito almeno un soft edit
- Scaduta la finestra, il report torna read-only definitivamente

---

## 6. Calculation Engine

Tutta la logica di calcolo è **lato client** durante la sessione, poi persistita su Supabase alla chiusura.

```typescript
// Pseudocode — da implementare in un hook o utility module

function calculateEventReport(eventStocks: EventStock[]): ReportSummary {
  const details = eventStocks.map(row => {
    const consumed         = row.initial_qty - row.final_qty
    const cost_value       = consumed * row.product.cost_price
    const rev_value        = consumed * row.product.selling_price
    const stock_value_cost = row.final_qty * row.product.cost_price
    const stock_value_sell = row.final_qty * row.product.selling_price
    return { ...row, consumed, cost_value, rev_value, stock_value_cost, stock_value_sell }
  })

  const total_cost_consumed    = details.reduce((acc, r) => acc + r.cost_value, 0)
  const total_revenue_est      = details.reduce((acc, r) => acc + r.rev_value, 0)
  const total_margin           = total_revenue_est - total_cost_consumed
  const total_stock_value_cost = details.reduce((acc, r) => acc + r.stock_value_cost, 0)
  const total_stock_value_sell = details.reduce((acc, r) => acc + r.stock_value_sell, 0)

  return { details, total_cost_consumed, total_revenue_est, total_margin, total_stock_value_cost, total_stock_value_sell }
}

function calculateReorder(products: Product[]): ReorderLine[] {
  return products
    .filter(p => p.is_active && p.min_threshold > 0)
    .map(p => ({
      ...p,
      qty_to_order: Math.max(0, p.min_threshold - p.current_stock),
      order_cost:   Math.max(0, p.min_threshold - p.current_stock) * p.cost_price,
    }))
    .filter(p => p.qty_to_order > 0)
}
```

---

## 7. Technical Stack

| Layer            | Technology                          | Note                                    |
|------------------|-------------------------------------|-----------------------------------------|
| Frontend         | React + Vite                        | PWA con Vite PWA Plugin                 |
| Styling          | Tailwind CSS v3                     | Mobile-first utility classes            |
| State Management | Zustand                             | Store globale leggero                   |
| Backend/DB       | Supabase                            | PostgreSQL + Auth + Realtime            |
| Auth             | Supabase Auth                       | Email/password, sessione persistente    |
| Routing          | React Router v6                     | SPA routing                             |
| Form Handling    | React Hook Form                     | Validazione input numerici              |
| PDF Generation   | jsPDF + jspdf-autotable             | Lato client, nessun backend necessario  |
| Deployment       | Vercel                              | Free tier, deploy automatico da GitHub  |

---

## 8. Folder Structure (React/Vite)

```
src/
├── components/
│   ├── ui/               # Componenti base: Button, Input, Badge, Card
│   ├── layout/           # AppShell, BottomNav, Header
│   ├── products/         # ProductCard, ProductForm, ProductList
│   ├── events/           # EventCard, EventList, NewEventModal
│   ├── stock/            # StockInputRow, StockList (apertura/chiusura)
│   ├── report/           # ReportSummary, ReportTable, ReportCard, SoftEditModal
│   └── restock/          # RestockModal, RestockForm
├── pages/
│   ├── Dashboard.tsx     # Home: stato corrente + azioni rapide
│   ├── Products.tsx      # Gestione prodotti + pulsante Genera Ordine
│   ├── NewEvent.tsx      # Apertura nuova serata
│   ├── OpenEvent.tsx     # Serata in corso: tab Apertura / Chiusura
│   ├── Report.tsx        # Visualizzazione report post-chiusura + download PDF
│   ├── History.tsx       # Lista serate passate
│   ├── Restock.tsx       # Gestione rifornimenti
│   └── ReorderPreview.tsx # Anteprima interattiva ordine acquisto
├── store/
│   ├── useProductStore.ts
│   ├── useEventStore.ts
│   └── useStockStore.ts
├── lib/
│   ├── supabase.ts       # Supabase client
│   ├── calculations.ts   # Engine delta + report + reorder
│   ├── pdf.ts            # Generatori PDF: reportPDF(), reorderPDF()
│   └── formatters.ts     # Currency, date, number formatters
├── hooks/
│   ├── useProducts.ts
│   ├── useEvents.ts
│   └── useStock.ts
└── types/
    └── index.ts          # Tutti i tipi TypeScript del dominio
```

---

## 9. UI/UX Guidelines

- **Layout:** Bottom navigation bar con 4 tab (Dashboard, Prodotti, Serata, Storico)
- **Input numerici:** font grande (min 24px), tastiera numerica nativa (`inputMode="decimal"`)
- **Bottoni primari:** full-width su mobile, altezza minima 56px
- **Feedback immediato:** preview consumato aggiornato on-change senza submit
- **Colori status:**
  - Verde → margine positivo / stock sufficiente
  - Arancio → attenzione / stock basso
  - Rosso → consumato anomalo (negativo) o errore
- **Dark mode opzionale** (consigliato per uso notturno in discoteca)
- **Nessuna dipendenza da connessione per il calcolo** — i dati vengono scritti su Supabase solo alla conferma

---

## 10. Business Rules

1. Non è possibile chiudere una serata senza aver inserito la `final_qty` per tutti i prodotti attivi.
2. Se `final_qty > initial_qty` per un prodotto, `consumed` risulta negativo → da segnalare visivamente come anomalia (non bloccante).
3. La chiusura scrive report e nuovo `current_stock` in una singola transazione Supabase. Il report è modificabile via Soft Edit entro 96 ore; trascorso il termine diventa read-only definitivamente.
4. I prezzi sul report sono quelli al momento della chiusura (snapshot) — non devono variare se i prezzi cambiano in futuro.
5. Il restock può avvenire sia prima dell'apertura che durante la serata — aggiorna solo `current_stock` e non impatta l'`initial_qty` già confermata.
6. Al momento della chiusura, `is_editable_until` viene impostato a `closed_at + INTERVAL '96 hours'`. Questo valore non è modificabile dall'utente.
7. Ogni Soft Edit salva uno snapshot completo `before/after` su `report_edit_log`. L'audit trail è immutabile — i log non possono essere cancellati né modificati dall'utente.
8. Il PDF del report riflette sempre lo stato attuale del report al momento del download — se è stato modificato via Soft Edit, il PDF include la nota di modifica nel footer.
9. Il PDF di ordine acquisto è generato sulla `current_stock` in tempo reale e non viene persistito — è sempre un documento "punto nel tempo". Le modifiche manuali alla `qty_to_order` nell'anteprima sono temporanee e non aggiornano il database.
10. Un prodotto con `min_threshold = 0` viene considerato "non monitorato" e non appare mai nel PDF di ordine acquisto, anche se `current_stock = 0`.

---

## 11. Out of Scope (v1)

- Gestione multi-venue
- Tracciamento vendite in tempo reale (POS)
- Integrazione con sistemi di cassa
- Barcode scanner
- Multi-currency
- Notifiche push
- Export PDF automatico

---

## 12. Environment Variables

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 13. Session Context for AI Code Generation

Quando si genera codice per questo progetto, assumere sempre:
- TypeScript strict mode attivo
- Supabase client già inizializzato in `src/lib/supabase.ts`
- Tailwind CSS configurato con tema dark opzionale
- Tutti i valori monetari in `NUMERIC(10,2)` — nessun float puro
- Le date degli eventi sono `DATE` (solo giorno, no ora) — le timestamp di sistema usano `TIMESTAMPTZ`
- L'utente autenticato è accessibile via `supabase.auth.getUser()`
