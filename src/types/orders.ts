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
  canManageOrders: boolean;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export type SupplierPurchaseOrderStatus =
  | 'pending'
  | 'whatsapp_opened'
  | 'sent_confirmed'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export type ReceiptLineStatus =
  | 'not_delivered'
  | 'partial'
  | 'received'
  | 'over_received';

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
  status: PurchaseOrderStatus;
  general_notes: string | null;
  requested_delivery_date: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  department?: { name: string } | null;
  items?: PurchaseOrderItem[];
  supplier_orders?: SupplierPurchaseOrder[];
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

export interface SupplierPurchaseOrderItem {
  id: string;
  supplier_purchase_order_id: string;
  venue_id: string;
  source_purchase_order_item_id: string | null;
  product_id: string | null;
  price_sentinel_product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  unit: string;
  package_note: string | null;
  supplier_name_snapshot: string;
  supplier_note: string | null;
  position: number;
  created_at: string;
}

export interface SupplierOrderReceiptItem {
  id: string;
  receipt_id: string;
  venue_id: string;
  supplier_purchase_order_item_id: string;
  ordered_quantity_snapshot: number;
  received_quantity: number;
  missing_quantity: number;
  note: string | null;
  line_status: ReceiptLineStatus;
  created_at: string;
}

export interface SupplierOrderReceipt {
  id: string;
  supplier_purchase_order_id: string;
  venue_id: string;
  idempotency_key: string;
  order_version: number;
  status: 'partial' | 'complete';
  declared_by: string;
  created_at: string;
  items?: SupplierOrderReceiptItem[];
}

export interface SupplierPurchaseOrder {
  id: string;
  purchase_order_id: string;
  venue_id: string;
  supplier_id: string;
  status: SupplierPurchaseOrderStatus;
  order_version: number | null;
  venue_name_snapshot: string | null;
  supplier_name_snapshot: string | null;
  requested_delivery_date_snapshot: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  confirmed_by: string | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
  supplier?: Pick<Supplier, 'id' | 'name' | 'whatsapp_number'> | null;
  snapshot_items?: SupplierPurchaseOrderItem[];
  receipts?: SupplierOrderReceipt[];
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

export interface ConfirmSupplierOrderInput {
  purchaseOrderId: string;
  supplierId: string;
  orderVersion: number;
}

export interface ReceiptDeclarationItem {
  supplierOrderItemId: string;
  receivedQuantity: string;
  note: string;
}

export interface RecordSupplierReceiptInput {
  supplierPurchaseOrderId: string;
  orderVersion: number;
  idempotencyKey: string;
  items: ReceiptDeclarationItem[];
}

export interface CancelSupplierOrderInput {
  purchaseOrderId: string;
  supplierId: string;
  orderVersion: number;
}
