import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';

interface ProductState {
  products: Product[];
  isLoading: boolean;
  fetchProducts: () => Promise<void>;
  updateStock: (productId: string, newStock: number) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'current_stock' | 'is_active'>) => Promise<void>;
}

export const useProductStore = create<ProductState>((set, get) => ({
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
      set({ products: data as Product[] });
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

  addProduct: async (product) => {
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();
      
    if (!error && data) {
      set((state) => ({ products: [...state.products, data as Product] }));
    }
  }
}));
