-- ============================================================
-- CLEANUP: RIMOZIONE SISTEMA MULTI-COUNT (DANGEROUS)
-- ============================================================

-- 1. Rimuovi il trigger
DROP TRIGGER IF EXISTS trg_sync_final_qty ON public.event_final_counts;

-- 2. Rimuovi la funzione di sincronizzazione
DROP FUNCTION IF EXISTS public.sync_event_stock_total();

-- 3. Rimuovi la tabella dei conteggi parziali
DROP TABLE IF EXISTS public.event_final_counts;

-- NOTA: I dati nella colonna `final_qty` della tabella `event_stocks` 
-- rimarranno quelli calcolati per ultimi. Il sistema tornerà a 
-- scrivere direttamente in quella colonna.
