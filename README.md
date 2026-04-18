# 🍸 LiquidStock Manager

Gestione professionale dell'inventario alcolici per discoteche, bar ed eventi. Mobile-first, offline-ready e integrata con Supabase.

## 🚀 Funzionalità

- **Apertura Serata**: Snapshot istantaneo della giacenza attuale.
- **Chiusura Serata**: Calcolo automatico di consumi, margini e valori di magazzino in base alla giacenza fisica finale.
- **Report PDF**: Generazione istantanea di report professionali per ogni evento.
- **Gestione Riordini**: Calcolo e generazione PDF dell'ordine di acquisto basato sulle soglie minime impostate.
- **Soft Edit**: Possibilità di correggere le giacenze inserite entro 96 ore dalla chiusura con audit trail completo.
- **PWA**: Installabile su smartphone per un uso rapido sul campo.

## 🛠 Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS (Dark Mode optimized)
- **State**: Zustand
- **Database/Auth**: Supabase
- **PDF**: jsPDF + jspdf-autotable

## 📦 Installazione Locale

1. Clona il repository
2. Installa le dipendenze: `npm install`
3. Configura le variabili d'ambiente in `.env.local`:
   ```env
   VITE_SUPABASE_URL=la_tua_url
   VITE_SUPABASE_ANON_KEY=la_tua_chiave
   ```
4. Avvia lo sviluppo: `npm run dev`

## 🌍 Deployment (Vercel)

Il progetto è pronto per essere deployato su **Vercel**:
1. Collega il tuo account GitHub a Vercel.
2. Importa il repository `liquidstock-manager`.
3. Aggiungi le variabili d'ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nelle impostazioni del progetto su Vercel.
4. Il deploy avverrà automaticamente ad ogni push.

---
Sviluppato con ❤️ per una gestione magazzino senza stress.
