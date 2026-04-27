import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import type { Event, EventStock, Product } from '../types';
import { calculateEventReport } from '../lib/calculations';

interface EventState {
  currentEvent: Event | null;
  eventStocks: EventStock[];
  isLoading: boolean;
  fetchCurrentEvent: () => Promise<void>;
  openNewEvent: (name: string, date: string, products: Product[]) => Promise<void>;
  updateFinalStock: (eventStockId: string, finalQty: number) => Promise<void>;
  closeEvent: () => Promise<void>;
  softEditReport: (eventId: string, reportId: string, productId: string, newFinalQty: number, note: string) => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  currentEvent: null,
  eventStocks: [],
  isLoading: false,

  fetchCurrentEvent: async () => {
    set({ isLoading: true });
    const { venueId } = useAuthStore.getState();
    if (!venueId) return;

    // Cerca eventuali eventi aperti
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .eq('venue_id', venueId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (events && events.length > 0) {
      const event = events[0];
      set({ currentEvent: event as Event });
      
      // Carica i relativi stock initiali e info prodotti collegate
      const { data: stocks } = await supabase
        .from('event_stocks')
        .select('*, product:products(*)')
        .eq('event_id', event.id);
        
      if (stocks) {
        set({ eventStocks: stocks as unknown as EventStock[] });
      }
    } else {
      set({ currentEvent: null, eventStocks: [] });
    }
    set({ isLoading: false });
  },

  openNewEvent: async (name, date, products) => {
    set({ isLoading: true });
    const { venueId } = useAuthStore.getState();
    
    // 1. Inserisci l'evento con il locale di appartenenza
    const { data: newEvent } = await supabase
      .from('events')
      .insert([{ name, date, status: 'open', venue_id: venueId }])
      .select()
      .single();
      
    if (newEvent) {
      // 2. Prepara e salva gli event_stocks (snapshot iniziale dalla giacenza corrente)
      const stocksToInsert = products.map(p => ({
        event_id: newEvent.id,
        product_id: p.id,
        initial_qty: p.current_stock
      }));
      
      const { data: insertedStocks } = await supabase
        .from('event_stocks')
        .insert(stocksToInsert)
        .select('*, product:products(*)');
        
      set({ currentEvent: newEvent as Event, eventStocks: (insertedStocks || []) as unknown as EventStock[] });

      // 3. Registra l'apertura nel Log
      const { user } = useAuthStore.getState();
      await supabase.from('activity_log').insert([{
        venue_id: venueId,
        user_id: user?.id,
        action_type: 'event_open',
        action_id: newEvent.id,
        details: { event_name: newEvent.name }
      }]);
    }
    set({ isLoading: false });
  },

  updateFinalStock: async (eventStockId, finalQty) => {
    // Aggiornamento ottimistico locale
    set(state => ({
      eventStocks: state.eventStocks.map(es => 
        es.id === eventStockId ? { ...es, final_qty: finalQty } : es
      )
    }));
    
    // Persistenza immediata su DB per evitare perdita dati
    try {
      await supabase
        .from('event_stocks')
        .update({ final_qty: finalQty })
        .eq('id', eventStockId);
    } catch (err) {
      console.error("Errore salvataggio giacenza finale:", err);
    }
  },

  closeEvent: async () => {
    const { currentEvent, eventStocks } = get();
    if (!currentEvent) return;
    const { venueId } = useAuthStore.getState();
    
    set({ isLoading: true });
    
    try {
      // 1. Aggiorna consumi e valori in event_stocks (per tutti i prodotti compilati)
      for (const es of eventStocks) {
        if (es.final_qty !== null && es.product) {
          const consumed = es.initial_qty - es.final_qty;
          const cost_value = consumed * es.product.cost_price;
          const stock_value_cost = es.final_qty * es.product.cost_price;

          await supabase.from('event_stocks').update({
            final_qty: es.final_qty,
            consumed: consumed,
            cost_value: cost_value,
            stock_value_cost: stock_value_cost,
          }).eq('id', es.id);
          
          // 2. Aggiorna nuovo stock reale del prodotto
          await supabase.from('products').update({
            current_stock: es.final_qty
          }).eq('id', es.product.id);
        }
      }

      // 3. Genera e salva il Report finale
      const summary = calculateEventReport(eventStocks);
      const { error: reportError } = await supabase.from('reports').insert([{
        event_id: currentEvent.id,
        total_cost_consumed: summary.total_cost_consumed,
        total_stock_value_cost: summary.total_stock_value_cost,
        details_json: summary.details_json,
        venue_id: venueId
      }]);

      if (reportError) throw reportError;

      // 4. Chiude l'Evento (Solo ora che tutto il resto è andato a buon fine!)
      const closedAt = new Date().toISOString();
      const editableUntil = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
      
      await supabase.from('events').update({
        status: 'closed',
        closed_at: closedAt,
        is_editable_until: editableUntil
      }).eq('id', currentEvent.id);

      // 5. Registra nell'Activity Log
      const { user } = useAuthStore.getState();
      await supabase.from('activity_log').insert([{
        venue_id: venueId,
        user_id: user?.id,
        action_type: 'event_close',
        action_id: currentEvent.id,
        details: { 
          event_name: currentEvent.name,
          summary: summary 
        }
      }]);

      set({ currentEvent: null, eventStocks: [] });
    } catch (error) {
      console.error("Errore durante la chiusura serata:", error);
      alert("Si è verificato un errore durante il salvataggio. Riprova tra un istante.");
    } finally {
      set({ isLoading: false });
    }
  },

  softEditReport: async (eventId, reportId, productId, newFinalQty, note) => {
    set({ isLoading: true });
    
    // 1. Recupera lo stato attuale del report e dello stock dell'evento
    const { data: eventStock } = await supabase
      .from('event_stocks')
      .select('*, product:products(*)')
      .eq('event_id', eventId)
      .eq('product_id', productId)
      .single();

    const { data: report } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (eventStock && report && eventStock.product) {
      const oldFinal = eventStock.final_qty || 0;
      const initial = eventStock.initial_qty || 0;
      const deltaStock = newFinalQty - oldFinal;
      const product = eventStock.product;

      // 2. Ricalcola i valori per questa riga
      const newConsumed = initial - newFinalQty;
      const newCostValue = newConsumed * product.cost_price;
      const newStockValueCost = newFinalQty * product.cost_price;

      // 3. Aggiorna event_stocks
      await supabase
        .from('event_stocks')
        .update({
          final_qty: newFinalQty,
          consumed: newConsumed,
          cost_value: newCostValue,
          stock_value_cost: newStockValueCost,
        })
        .eq('id', eventStock.id);

      // 4. Aggiorna current_stock nel database
      const { data: prodData } = await supabase.from('products').select('current_stock').eq('id', productId).single();
      if(prodData) {
        await supabase.from('products').update({
          current_stock: prodData.current_stock + deltaStock
        }).eq('id', productId);
      }

      // 5. Ricalcola l'intero report (total cost, revenue, etc)
      // Per semplicità recuperiamo tutti gli stocks aggiornati dell'evento
      const { data: allStocks } = await supabase
        .from('event_stocks')
        .select('*, product:products(*)')
        .eq('event_id', eventId);

      if (allStocks) {
        const summary = calculateEventReport(allStocks as unknown as EventStock[]);
        
        // 6. Aggiorna la tabella reports con i nuovi totali e il nuovo JSON
        await supabase
          .from('reports')
          .update({
            total_cost_consumed: summary.total_cost_consumed,
            total_stock_value_cost: summary.total_stock_value_cost,
            details_json: summary.details_json
          })
          .eq('id', reportId);

        // 7. Salva nel log delle modifiche per audit trail
        await supabase
          .from('report_edit_log')
          .insert([{
            report_id: reportId,
            field_changed: `final_qty_${productId}`,
            old_value: oldFinal,
            new_value: newFinalQty,
            note: note,
            snapshot_before: report.details_json,
            snapshot_after: summary.details_json
          }]);
      }
    }
    set({ isLoading: false });
  }
}));
