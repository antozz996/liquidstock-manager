import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  Truck,
} from 'lucide-react';
import { OrderStatusBadge } from '../components/orders/OrderStatusBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { formatDateTime } from '../lib/formatters';
import { useAuthStore } from '../store/useAuthStore';
import { useOrderStore } from '../store/useOrderStore';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  SupplierPurchaseOrder,
  SupplierPurchaseOrderStatus,
} from '../types/orders';

interface SupplierGroup {
  supplierId: string;
  name: string;
  items: PurchaseOrderItem[];
  tracked: SupplierPurchaseOrder | null;
  status: SupplierPurchaseOrderStatus;
}

export default function OrderDetail() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { venueId } = useAuthStore();
  const {
    canSendWhatsappOrders,
    canManageOrders,
    checkPermission,
    fetchOrder,
    confirmSupplierOrder,
    cancelSupplierOrder,
    cancelOrder,
  } = useOrderStore();
  const [order,setOrder] = useState<PurchaseOrder | null>(null);
  const [loadState,setLoadState] = useState<'loading' | 'ready' | 'missing' | 'forbidden'>('loading');
  const [actionError,setActionError] = useState<string | null>(null);
  const [busySupplierId,setBusySupplierId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) {
      setLoadState('missing');
      return;
    }
    setLoadState('loading');
    try {
      const capabilities = await checkPermission();
      if (!capabilities.canCreateManualOrders) {
        setLoadState('forbidden');
        return;
      }
      const loaded = await fetchOrder(orderId);
      if (!loaded) {
        setLoadState('missing');
        return;
      }
      setOrder(loaded);
      setLoadState('ready');
    } catch {
      setLoadState('missing');
    }
  }, [checkPermission,fetchOrder,orderId]);

  useEffect(() => {
    void load();
  }, [load,venueId]);

  const groups = useMemo<SupplierGroup[]>(() => {
    if (!order) return [];
    const grouped = new Map<string,PurchaseOrderItem[]>();
    for (const item of order.items || []) {
      if (!item.supplier_id) continue;
      grouped.set(item.supplier_id,[...(grouped.get(item.supplier_id) || []),item]);
    }
    return [...grouped.entries()].map(([supplierId,items]) => {
      const tracked = order.supplier_orders?.find(
        (supplierOrder) => supplierOrder.supplier_id === supplierId,
      ) || null;
      return {
        supplierId,
        name: tracked?.supplier_name_snapshot
          || tracked?.supplier?.name
          || items[0]?.supplier_name_snapshot
          || 'Fornitore',
        items,
        tracked,
        status: tracked?.status || 'pending',
      };
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [order]);

  const confirmSent = async (group: SupplierGroup) => {
    if (!order || !confirm(
      `Confermare l’invio a ${group.name}? Verrà creato uno snapshot immutabile e la bozza sarà bloccata.`,
    )) return;
    setBusySupplierId(group.supplierId);
    setActionError(null);
    try {
      await confirmSupplierOrder({
        purchaseOrderId: order.id,
        supplierId: group.supplierId,
        orderVersion: order.version,
      });
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Conferma invio non riuscita.');
    } finally {
      setBusySupplierId(null);
    }
  };

  const cancelSupplier = async (group: SupplierGroup) => {
    if (!order || !confirm(`Annullare il sotto-ordine per ${group.name}? L’azione è irreversibile.`)) {
      return;
    }
    setBusySupplierId(group.supplierId);
    setActionError(null);
    try {
      await cancelSupplierOrder({
        purchaseOrderId: order.id,
        supplierId: group.supplierId,
        orderVersion: order.version,
      });
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Annullamento non riuscito.');
    } finally {
      setBusySupplierId(null);
    }
  };

  const cancelWholeOrder = async () => {
    if (!order || !confirm(
      `Annullare definitivamente ${order.order_code} e tutti i sotto-ordini ancora aperti?`,
    )) return;
    setActionError(null);
    try {
      await cancelOrder(order.id,order.version);
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Annullamento non riuscito.');
    }
  };

  if (loadState === 'loading') {
    return <div className="py-24 text-center text-muted-foreground">Caricamento dettaglio…</div>;
  }
  if (loadState === 'forbidden') {
    return <div className="py-24 text-center text-muted-foreground">Permesso Ordini non disponibile.</div>;
  }
  if (loadState === 'missing' || !order) {
    return <div className="py-24 text-center text-muted-foreground">Ordine non trovato o non accessibile.</div>;
  }

  const isTerminal = ['received','cancelled'].includes(order.status);
  const unassignedCount = (order.items || []).filter((item) => !item.supplier_id).length;

  return (
    <div className="space-y-6 pt-4 pb-28" data-testid="order-detail-page">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate('/orders')}>
          <ArrowLeft size={20} />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            {order.order_code} · v{order.version}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black uppercase italic tracking-tighter">Storico ordine</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {order.department?.name || 'Reparto'} · aggiornato {formatDateTime(order.updated_at)}
          </p>
        </div>
      </div>

      <Card className="p-5 space-y-3 border-white/5 bg-white/5">
        {order.requested_delivery_date && (
          <p className="text-sm">
            <span className="text-muted-foreground">Consegna richiesta:</span>{' '}
            <strong>{order.requested_delivery_date}</strong>
          </p>
        )}
        {order.general_notes && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Note</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{order.general_notes}</p>
          </div>
        )}
        {unassignedCount > 0 && (
          <p className="text-xs text-accent-orange">
            {unassignedCount} righe senza fornitore non fanno parte di alcun sotto-ordine.
          </p>
        )}
      </Card>

      {actionError && (
        <Card className="p-4 border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">
          {actionError}
        </Card>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const tracked = group.tracked;
          const snapshots = [...(tracked?.snapshot_items || [])].sort((a,b) => a.position-b.position);
          const receipts = [...(tracked?.receipts || [])].sort(
            (a,b) => b.created_at.localeCompare(a.created_at),
          );
          const canConfirm = ['pending','whatsapp_opened'].includes(group.status);
          const canReceive = ['sent_confirmed','partially_received'].includes(group.status);
          const canCancel = !['received','cancelled'].includes(group.status);
          return (
            <Card
              key={group.supplierId}
              data-testid={`supplier-order-${group.supplierId}`}
              className="p-5 space-y-4 border-white/10 bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-primary shrink-0" />
                    <h2 className="font-black uppercase tracking-tight truncate">{group.name}</h2>
                  </div>
                  <div className="mt-2"><OrderStatusBadge status={group.status} /></div>
                </div>
                <span className="text-[9px] text-muted-foreground">{group.items.length} righe</span>
              </div>

              {tracked && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  {tracked.sent_at && (
                    <span className="flex gap-1.5"><Clock3 size={12} /> WhatsApp {formatDateTime(tracked.sent_at)}</span>
                  )}
                  {tracked.confirmed_at && (
                    <span className="flex gap-1.5"><CheckCircle2 size={12} /> Confermato {formatDateTime(tracked.confirmed_at)}</span>
                  )}
                  {tracked.received_at && (
                    <span className="flex gap-1.5"><PackageCheck size={12} /> Ricevuto {formatDateTime(tracked.received_at)}</span>
                  )}
                  {tracked.cancelled_at && (
                    <span className="flex gap-1.5"><Ban size={12} /> Annullato {formatDateTime(tracked.cancelled_at)}</span>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {(snapshots.length > 0 ? snapshots : group.items).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/5 bg-black/20 p-3">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-bold">{item.product_name_snapshot}</p>
                      <p className="text-xs whitespace-nowrap">{item.quantity} {item.unit}</p>
                    </div>
                    {item.package_note && (
                      <p className="text-[10px] text-muted-foreground mt-1">{item.package_note}</p>
                    )}
                    {item.supplier_note && (
                      <p className="text-[10px] text-primary mt-1">{item.supplier_note}</p>
                    )}
                  </div>
                ))}
              </div>

              {receipts.length > 0 && (
                <div className="pt-3 border-t border-white/5 space-y-3">
                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <ReceiptText size={13} /> Dichiarazioni di ricezione
                  </h3>
                  {receipts.map((receipt) => (
                    <div key={receipt.id} className="rounded-lg bg-black/20 p-3">
                      <div className="flex justify-between text-[10px]">
                        <strong className={receipt.status === 'complete' ? 'text-accent-green' : 'text-accent-orange'}>
                          {receipt.status === 'complete' ? 'Completa' : 'Parziale'}
                        </strong>
                        <span className="text-muted-foreground">{formatDateTime(receipt.created_at)}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {(receipt.items || []).map((item) => {
                          const snapshot = snapshots.find(
                            (candidate) => candidate.id === item.supplier_purchase_order_item_id,
                          );
                          return (
                            <p key={item.id} className="text-[10px] text-muted-foreground">
                              {snapshot?.product_name_snapshot || 'Riga'}: ricevuti{' '}
                              <strong className={item.line_status === 'over_received' ? 'text-accent-orange' : 'text-white'}>
                                {item.received_quantity}
                              </strong>
                              {' '}· mancanti {item.missing_quantity}
                              {item.note ? ` · ${item.note}` : ''}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {canConfirm && canSendWhatsappOrders && (
                  <Button
                    data-testid={`detail-confirm-sent-${group.supplierId}`}
                    className="gap-2 text-[10px] font-black uppercase tracking-widest"
                    disabled={busySupplierId === group.supplierId}
                    onClick={() => void confirmSent(group)}
                  >
                    <LockKeyhole size={14} /> Conferma inviato
                  </Button>
                )}
                {canReceive && canManageOrders && tracked && (
                  <Link
                    to={`/orders/${order.id}/suppliers/${tracked.id}/receive`}
                    className="block"
                  >
                    <Button
                      data-testid={`receive-supplier-${group.supplierId}`}
                      variant="secondary"
                      className="w-full gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                      <PackageCheck size={14} /> Ricevi ordine
                    </Button>
                  </Link>
                )}
                {canCancel && canManageOrders && (
                  <Button
                    data-testid={`cancel-supplier-${group.supplierId}`}
                    variant="ghost"
                    className="gap-2 text-[10px] font-black uppercase tracking-widest text-accent-red"
                    disabled={busySupplierId === group.supplierId}
                    onClick={() => void cancelSupplier(group)}
                  >
                    <Ban size={14} /> Annulla fornitore
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {canManageOrders && !isTerminal && (
        <Button
          data-testid="cancel-whole-order"
          variant="destructive"
          className="w-full gap-2 font-black uppercase tracking-widest text-[10px]"
          onClick={() => void cancelWholeOrder()}
        >
          <Ban size={15} /> Annulla intero ordine
        </Button>
      )}
    </div>
  );
}
