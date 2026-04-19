import type { Product, EventStock, ReportSummary } from '../types';

/**
 * Calcola i dati del report per un evento basandosi sugli stocks registrati.
 */
export function calculateEventReport(stocks: EventStock[]): ReportSummary {
  const details = stocks.map(row => {
    const initial = row.initial_qty || 0;
    const final = row.final_qty || 0;
    const product = row.product;
    
    if (!product) {
      return {
        ...row,
        consumed: 0,
        cost_value: 0,
        stock_value_cost: 0
      };
    }

    const consumed = initial - final;
    const cost_value = consumed * product.cost_price;
    const stock_value_cost = final * product.cost_price;

    return {
      ...row,
      consumed,
      cost_value,
      stock_value_cost
    };
  });

  const total_cost_consumed = details.reduce((acc, r) => acc + (r.cost_value || 0), 0);
  const total_stock_value_cost = details.reduce((acc, r) => acc + (r.stock_value_cost || 0), 0);

  return {
    details_json: details,
    total_cost_consumed,
    total_stock_value_cost
  };
}

/**
 * Calcola i prodotti da riordinare in base alla soglia minima.
 */
export function calculateReorder(products: Product[]) {
  return products
    .filter(p => p.is_active && p.min_threshold > 0)
    .map(p => {
      const qty_to_order = Math.max(0, p.min_threshold - (p.current_stock || 0));
      return {
        ...p,
        qty_to_order,
        order_cost: qty_to_order * p.cost_price
      };
    })
    .filter(p => p.qty_to_order > 0);
}
