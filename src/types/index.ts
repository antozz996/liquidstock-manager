export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  min_threshold: number;
  created_at?: string;
  updated_at?: string;
  is_active: boolean;
}

export interface Event {
  id: string;
  name: string;
  date: string; // ISO date string YYYY-MM-DD
  status: 'open' | 'closed';
  created_at?: string;
  closed_at?: string;
  is_editable_until?: string;
}

export interface EventStock {
  id: string;
  event_id: string;
  product_id: string;
  initial_qty: number;
  final_qty: number | null;
  consumed: number | null;
  cost_value: number | null;
  rev_value: number | null;
  stock_value_cost: number | null;
  stock_value_sell: number | null;
  product?: Product; // Da precaricare con select('*, product:products(*)')
}

export interface Report {
  id: string;
  event_id: string;
  generated_at: string;
  total_cost_consumed: number;
  total_revenue_est: number;
  total_margin: number;
  total_stock_value_cost: number;
  total_stock_value_sell: number;
  details_json: any; // array di righe snapshot
}
export interface ReportSummary {
  total_cost_consumed: number;
  total_revenue_est: number;
  total_margin: number;
  total_stock_value_cost: number;
  total_stock_value_sell: number;
  details_json: any[];
}
