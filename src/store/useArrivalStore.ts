import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { useProductStore } from './useProductStore';

interface ArrivalState {
  activeSession: any | null;
  items: Record<string, number>;
  isLoading: boolean;
  startSession: () => Promise<void>;
  updateItemQty: (productId: string, qty: number) => void;
  closeSession: (notes?: string) => Promise<void>;
  fetchActiveSession: () => Promise<void>;
}

export const useArrivalStore = create<ArrivalState>((set, get) => ({
  activeSession: null,
  items: {},
  isLoading: false,

  fetchActiveSession: async () => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) return;

    const { data: session } = await supabase
      .from('restock_sessions')
      .select('*, restock_items(*)')
      .eq('venue_id', venueId)
      .eq('status', 'open')
      .maybeSingle();

    if (session) {
      const itemsMap: Record<string, number> = {};
      session.restock_items.forEach((it: any) => {
        itemsMap[it.product_id] = it.quantity;
      });
      set({ activeSession: session, items: itemsMap });
    } else {
      set({ activeSession: null, items: {} });
    }
  },

  startSession: async () => {
    set({ isLoading: true });
    const { venueId } = useAuthStore.getState();
    
    const { data, error } = await supabase
      .from('restock_sessions')
      .insert([{ venue_id: venueId, status: 'open' }])
      .select()
      .single();

    if (!error && data) {
      set({ activeSession: data, items: {} });
    }
    set({ isLoading: false });
  },

  updateItemQty: (productId, qty) => {
    set((state) => ({
      items: { ...state.items, [productId]: qty }
    }));
  },

  closeSession: async (notes) => {
    const { activeSession, items } = get();
    if (!activeSession) return;

    set({ isLoading: true });

    // 1. Salva gli articoli della sessione
    const itemsToInsert = Object.entries(items)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        session_id: activeSession.id,
        product_id: productId,
        quantity: qty
      }));

    if (itemsToInsert.length > 0) {
      await supabase.from('restock_items').insert(itemsToInsert);

      // 2. Aggiorna il magazzino reale (current_stock)
      for (const item of itemsToInsert) {
        const { data: prod } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', item.product_id)
          .single();
        
        if (prod) {
          const newStock = (prod.current_stock || 0) + item.quantity;
          await supabase
            .from('products')
            .update({ current_stock: newStock })
            .eq('id', item.product_id);
        }
      }
    }

    // 3. Chiudi la sessione
    await supabase
      .from('restock_sessions')
      .update({ 
        status: 'closed', 
        closed_at: new Date().toISOString(),
        notes 
      })
      .eq('id', activeSession.id);

    set({ activeSession: null, items: {} });
    await useProductStore.getState().fetchProducts();
    set({ isLoading: false });
  }
}));
