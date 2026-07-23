import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import type { Product } from '../types';
import type {
  CancelSupplierOrderInput,
  ConfirmSupplierOrderInput,
  Department,
  OrderCapabilities,
  PurchaseOrder,
  RecordSupplierReceiptInput,
  RecordWhatsappOpenedInput,
  SaveManualOrderDraftInput,
  Supplier,
  SupplierOrderDispatch,
  SupplierOrderReceipt,
  SupplierPurchaseOrder,
} from '../types/orders';

interface NewSupplierInput {
  name: string;
  contactName: string;
  whatsappNumber: string;
}

interface OrderState {
  orders: PurchaseOrder[];
  departments: Department[];
  suppliers: Supplier[];
  products: Product[];
  venueName: string;
  canCreateManualOrders: boolean;
  canSendWhatsappOrders: boolean;
  canManageOrders: boolean;
  isCheckingPermission: boolean;
  isLoading: boolean;
  checkPermission: () => Promise<OrderCapabilities>;
  fetchOrders: () => Promise<void>;
  fetchReferenceData: () => Promise<void>;
  fetchOrder: (orderId: string) => Promise<PurchaseOrder | null>;
  fetchDraft: (orderId: string) => Promise<PurchaseOrder | null>;
  saveDraft: (input: SaveManualOrderDraftInput) => Promise<PurchaseOrder>;
  deleteDraft: (orderId: string) => Promise<void>;
  createSupplier: (input: NewSupplierInput) => Promise<Supplier>;
  recordWhatsappOpened: (input: RecordWhatsappOpenedInput) => Promise<SupplierOrderDispatch>;
  confirmSupplierOrder: (input: ConfirmSupplierOrderInput) => Promise<SupplierPurchaseOrder>;
  recordSupplierReceipt: (input: RecordSupplierReceiptInput) => Promise<SupplierOrderReceipt>;
  cancelSupplierOrder: (input: CancelSupplierOrderInput) => Promise<SupplierPurchaseOrder>;
  cancelOrder: (orderId: string, orderVersion: number) => Promise<PurchaseOrder>;
}

const orderSelection = `
  *,
  department:departments(name),
  items:purchase_order_items(*),
  supplier_orders:supplier_purchase_orders(
    *,
    supplier:suppliers(id,name,whatsapp_number),
    snapshot_items:supplier_purchase_order_items(*),
    receipts:supplier_order_receipts(
      *,
      items:supplier_order_receipt_items(*)
    )
  )
`;

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  departments: [],
  suppliers: [],
  products: [],
  venueName: '',
  canCreateManualOrders: false,
  canSendWhatsappOrders: false,
  canManageOrders: false,
  isCheckingPermission: false,
  isLoading: false,

  checkPermission: async () => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) {
      const denied = {
        canCreateManualOrders: false,
        canSendWhatsappOrders: false,
        canManageOrders: false,
      };
      set({ ...denied, isCheckingPermission: false });
      return denied;
    }
    set({
      isCheckingPermission: true,
      canCreateManualOrders: false,
      canSendWhatsappOrders: false,
      canManageOrders: false,
    });
    const [createResult, sendResult, manageResult] = await Promise.all([
      supabase.rpc('has_order_permission', {
        target_venue_id: venueId,
        permission_name: 'can_create_manual_orders',
      }),
      supabase.rpc('has_order_permission', {
        target_venue_id: venueId,
        permission_name: 'can_send_whatsapp_orders',
      }),
      supabase.rpc('has_order_permission', {
        target_venue_id: venueId,
        permission_name: 'can_manage_orders',
      }),
    ]);
    const capabilities = {
      canCreateManualOrders: !createResult.error && createResult.data === true,
      canSendWhatsappOrders: !sendResult.error && sendResult.data === true,
      canManageOrders: !manageResult.error && manageResult.data === true,
    };
    set({ ...capabilities, isCheckingPermission: false });
    return capabilities;
  },

  fetchOrders: async () => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) {
      set({ orders: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(orderSelection)
        .eq('venue_id', venueId)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      set({ orders: (data || []) as unknown as PurchaseOrder[] });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchReferenceData: async () => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) {
      set({ departments: [], suppliers: [], products: [], venueName: '' });
      return;
    }
    const [departmentsResult, suppliersResult, productsResult, venueResult] = await Promise.all([
      supabase.from('departments').select('*').eq('venue_id', venueId).eq('is_active', true).order('name'),
      supabase.from('suppliers').select('*').eq('venue_id', venueId).order('name'),
      supabase.from('products').select('*').eq('venue_id', venueId).eq('is_active', true).order('name'),
      supabase.from('venues').select('name').eq('id', venueId).maybeSingle(),
    ]);
    const firstError = departmentsResult.error || suppliersResult.error || productsResult.error || venueResult.error;
    if (firstError) throw new Error(firstError.message);
    set({
      departments: (departmentsResult.data || []) as Department[],
      suppliers: (suppliersResult.data || []) as Supplier[],
      products: (productsResult.data || []) as Product[],
      venueName: venueResult.data?.name || '',
    });
  },

  fetchOrder: async (orderId) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) return null;
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(orderSelection)
      .eq('id', orderId)
      .eq('venue_id', venueId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as unknown as PurchaseOrder | null;
  },

  fetchDraft: async (orderId) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) return null;
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(orderSelection)
      .eq('id', orderId)
      .eq('venue_id', venueId)
      .eq('status', 'draft')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as unknown as PurchaseOrder | null;
  },

  saveDraft: async (input) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.rpc('save_purchase_order_draft', {
        p_venue_id: venueId,
        p_department_id: input.departmentId,
        p_items: input.items.map((item, position) => ({
          product_id: item.product_id,
          product_name_snapshot: item.product_name_snapshot,
          quantity: item.quantity,
          unit: item.unit,
          package_note: item.package_note || null,
          supplier_id: item.supplier_id,
          supplier_name_snapshot: item.supplier_name_snapshot || null,
          supplier_note: item.supplier_note || null,
          position,
        })),
        p_general_notes: input.generalNotes || null,
        p_requested_delivery_date: input.requestedDeliveryDate || null,
        p_order_id: input.id || null,
        p_expected_version: input.expectedVersion ?? null,
      });
      if (error) throw new Error(error.message);
      await get().fetchOrders();
      return data as unknown as PurchaseOrder;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteDraft: async (orderId) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', orderId)
      .eq('venue_id', venueId)
      .eq('status', 'draft')
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length !== 1) throw new Error('Bozza non disponibile o non autorizzata.');
    set((state) => ({ orders: state.orders.filter((order) => order.id !== orderId) }));
  },

  createSupplier: async (input) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        venue_id: venueId,
        name: input.name.trim(),
        contact_name: input.contactName.trim() || null,
        whatsapp_number: input.whatsappNumber.trim() || null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const supplier = data as Supplier;
    set((state) => ({ suppliers: [...state.suppliers, supplier].sort((a, b) => a.name.localeCompare(b.name)) }));
    return supplier;
  },

  recordWhatsappOpened: async (input) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase.rpc('record_whatsapp_opened', {
      p_purchase_order_id: input.purchaseOrderId,
      p_venue_id: venueId,
      p_supplier_id: input.supplierId,
      p_order_version: input.orderVersion,
      p_whatsapp_number_snapshot: input.whatsappNumberSnapshot,
      p_message_snapshot: input.messageSnapshot,
    });
    if (error) throw new Error(error.message);
    await get().fetchOrders();
    return data as unknown as SupplierOrderDispatch;
  },

  confirmSupplierOrder: async (input) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase.rpc('confirm_supplier_order_sent', {
      p_purchase_order_id: input.purchaseOrderId,
      p_venue_id: venueId,
      p_supplier_id: input.supplierId,
      p_expected_version: input.orderVersion,
    });
    if (error) throw new Error(error.message);
    await get().fetchOrders();
    return data as unknown as SupplierPurchaseOrder;
  },

  recordSupplierReceipt: async (input) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase.rpc('record_supplier_order_receipt', {
      p_supplier_purchase_order_id: input.supplierPurchaseOrderId,
      p_venue_id: venueId,
      p_order_version: input.orderVersion,
      p_items: input.items.map((item) => ({
        supplier_order_item_id: item.supplierOrderItemId,
        received_quantity: item.receivedQuantity.replace(',','.'),
        note: item.note.trim() || null,
      })),
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    await get().fetchOrders();
    return data as unknown as SupplierOrderReceipt;
  },

  cancelSupplierOrder: async (input) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase.rpc('cancel_supplier_order', {
      p_purchase_order_id: input.purchaseOrderId,
      p_venue_id: venueId,
      p_supplier_id: input.supplierId,
      p_expected_version: input.orderVersion,
    });
    if (error) throw new Error(error.message);
    await get().fetchOrders();
    return data as unknown as SupplierPurchaseOrder;
  },

  cancelOrder: async (orderId, orderVersion) => {
    const { venueId } = useAuthStore.getState();
    if (!venueId) throw new Error('Seleziona prima un locale.');
    const { data, error } = await supabase.rpc('cancel_purchase_order', {
      p_purchase_order_id: orderId,
      p_venue_id: venueId,
      p_expected_version: orderVersion,
    });
    if (error) throw new Error(error.message);
    await get().fetchOrders();
    return data as unknown as PurchaseOrder;
  },
}));
