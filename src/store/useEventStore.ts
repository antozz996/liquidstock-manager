import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Event, EventStock, Product } from '../types';

interface EventState {
  currentEvent: Event | null;
  eventStocks: EventStock[];
  isLoading: boolean;
  fetchCurrentEvent: () => Promise<void>;
  openNewEvent: (name: string, date: string, products: Product[]) => Promise<void>;
  updateFinalStock: (eventStockId: string, finalQty: number) => Promise<void>;
  closeEvent: () => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  currentEvent: null,
  eventStocks: [],
  isLoading: false,

  fetchCurrentEvent: async () => {
    set({ isLoading: true });
    // Cerca eventuali eventi aperti
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
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
    
    // 1. Inserisci l'evento
    const { data: newEvent, error: evErr } = await supabase
      .from('events')
      .insert([{ name, date, status: 'open' }])
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
    }
    set({ isLoading: false });
  },

  updateFinalStock: async (eventStockId, finalQty) => {
    set(state => ({
      eventStocks: state.eventStocks.map(es => 
        es.id === eventStockId ? { ...es, final_qty: finalQty } : es
      )
    }));
    
    // Salviamo subito via API per non perdere i dati se l'app si ricarica? 
    // Oppure salviamo solo tutto in blocco alla chiusura. Facciamo tutto in blocco.
  },

  closeEvent: async () => {
    const { currentEvent, eventStocks } = get();
    if (!currentEvent) return;
    
    set({ isLoading: true });
    // Questo andrebbe fatto con una Remote Procedure (RPC) per transazione sicura,
    // ma simuliamo le chiamate multiple per la PWA standalone.
    
    // 1. Chiude Evento
    const closedAt = new Date().toISOString();
    // simuliamo +4 giorni per edit window
    const editableUntil = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
    
    await supabase.from('events').update({
      status: 'closed',
      closed_at: closedAt,
      is_editable_until: editableUntil
    }).eq('id', currentEvent.id);

    // 2. Aggiorna final_qty in event_stocks
    for (const es of eventStocks) {
      if (es.final_qty !== null && es.product) {
        const consumed = es.initial_qty - es.final_qty;
        await supabase.from('event_stocks').update({
          final_qty: es.final_qty,
          consumed: consumed,
          cost_value: consumed * es.product.cost_price,
          rev_value: consumed * es.product.selling_price,
          stock_value_cost: es.final_qty * es.product.cost_price,
          stock_value_sell: es.final_qty * es.product.selling_price
        }).eq('id', es.id);
        
        // 3. Aggiorna nuovo stock del prodotto!
        await supabase.from('products').update({
          current_stock: es.final_qty
        }).eq('id', es.product.id);
      }
    }

    set({ currentEvent: null, eventStocks: [] });
    set({ isLoading: false });
  }
}));
