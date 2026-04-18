import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { sortProducts } from '../lib/utils';
import type { Product } from '../types';

interface ProductState {
  products: Product[];
  isLoading: boolean;
  fetchProducts: () => Promise<void>;
  updateStock: (productId: string, newStock: number) => Promise<void>;
  restockProduct: (productId: string, quantity: number, note?: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'current_stock' | 'is_active'>) => Promise<void>;
  bulkAddProducts: (products: Omit<Product, 'id' | 'current_stock' | 'is_active'>[]) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<void>;
}


export const useProductStore = create<ProductState>((set) => ({
  products: [],
  isLoading: false,

  fetchProducts: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) {
      console.error("Error fetching products:", error);
    } else {
      set({ products: sortProducts(data as Product[]) });
    }
    set({ isLoading: false });
  },

  updateStock: async (productId: string, newStock: number) => {
    const { error } = await supabase
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', productId);
      
    if (!error) {
      set((state) => ({
        products: state.products.map(p => p.id === productId ? { ...p, current_stock: newStock } : p)
      }));
    }
  },

  restockProduct: async (productId, quantity, note) => {
    set({ isLoading: true });
    // 1. Prendi stock attuale
    const { data: current } = await supabase
      .from('products')
      .select('current_stock')
      .eq('id', productId)
      .single();

    if (current) {
      const newStock = (current.current_stock || 0) + quantity;
      
      // 2. Aggiorna stock
      await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId);

      // 3. Registra log
      await supabase
        .from('restock_log')
        .insert([{ product_id: productId, qty_added: quantity, note: note || 'Rifornimento manuale' }]);

      set(state => ({
        products: state.products.map(p => p.id === productId ? { ...p, current_stock: newStock } : p)
      }));
    }
    set({ isLoading: false });
  },

  addProduct: async (product) => {
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();
      
    if (!error && data) {
      set((state) => ({ products: [...state.products, data as Product] }));
    }
  },

  bulkAddProducts: async (products) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('products')
      .insert(products)
      .select();
      
    if (!error && data) {
      set((state) => ({ products: [...state.products, ...(data as Product[])] }));
    }
    set({ isLoading: false });
  },

  updateProduct: async (productId, updates) => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .select()
      .single();
      
    if (!error && data) {
      set((state) => ({
        products: state.products.map(p => p.id === productId ? { ...p, ...(data as Product) } : p)
      }));
    }
    set({ isLoading: false });
  }
}));
