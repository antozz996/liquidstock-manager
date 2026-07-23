export interface Department {
  id: string;
  venue_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  venue_id: string;
  name: string;
  contact_name: string | null;
  whatsapp_number: string | null;
  is_active: boolean;
  price_sentinel_supplier_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderPermission {
  id?: string;
  venue_id: string;
  user_id: string;
  can_create_manual_orders: boolean;
  can_create_stock_orders: boolean;
  can_manage_orders: boolean;
  can_send_whatsapp_orders: boolean;
  can_view_purchase_prices: boolean;
  is_active: boolean;
}

export interface OrderCapabilities {
  canCreateManualOrders: boolean;
  canSendWhatsappOrders: boolean;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  venue_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  unit: string;
  package_note: string | null;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  supplier_note: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  order_code: string;
  venue_id: string;
  department_id: string;
  mode: 'manual';
  status: 'draft';
  general_notes: string | null;
  requested_delivery_date: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  department?: { name: string } | null;
  items?: PurchaseOrderItem[];
}

export interface SupplierOrderDispatch {
  id: string;
  purchase_order_id: string;
  venue_id: string;
  supplier_id: string;
  whatsapp_number_snapshot: string;
  message_snapshot: string;
  status: 'whatsapp_opened';
  order_version: number;
  opened_by: string;
  opened_at: string;
  created_at: string;
}

export interface ManualOrderDraftItem {
  client_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  quantity: string;
  unit: string;
  package_note: string;
  supplier_id: string | null;
  supplier_name_snapshot: string;
  supplier_note: string;
}

export interface SaveManualOrderDraftInput {
  id?: string;
  expectedVersion?: number;
  departmentId: string;
  generalNotes: string;
  requestedDeliveryDate: string;
  items: ManualOrderDraftItem[];
}

export interface RecordWhatsappOpenedInput {
  purchaseOrderId: string;
  supplierId: string;
  orderVersion: number;
  whatsappNumberSnapshot: string;
  messageSnapshot: string;
}
