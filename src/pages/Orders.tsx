import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  ClipboardList,
  Eye,
  MessageCircle,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { OrderStatusBadge } from '../components/orders/OrderStatusBadge';
import { WhatsAppOrderModal } from '../components/orders/WhatsAppOrderModal';
import { formatDateTime } from '../lib/formatters';
import { useAuthStore } from '../store/useAuthStore';
import { useOrderStore } from '../store/useOrderStore';
import type {
  PurchaseOrder,
  SupplierPurchaseOrderStatus,
} from '../types/orders';

const supplierGroups = (order: PurchaseOrder) => {
  const groups = new Map<string,{ name: string; status: SupplierPurchaseOrderStatus }>();
  for (const item of order.items || []) {
    if (!item.supplier_id) continue;
    const tracked = order.supplier_orders?.find(
      (supplierOrder) => supplierOrder.supplier_id === item.supplier_id,
    );
    groups.set(item.supplier_id,{
      name: tracked?.supplier_name_snapshot
        || tracked?.supplier?.name
        || item.supplier_name_snapshot
        || 'Fornitore',
      status: tracked?.status || 'pending',
    });
  }
  return [...groups.entries()].map(([supplierId,value]) => ({ supplierId,...value }));
};

export default function Orders() {
  const { venueId } = useAuthStore();
  const {
    orders,
    suppliers,
    venueName,
    canCreateManualOrders,
    canSendWhatsappOrders,
    canManageOrders,
    isLoading,
    checkPermission,
    fetchOrders,
    fetchReferenceData,
    deleteDraft,
    recordWhatsappOpened,
    confirmSupplierOrder,
    cancelOrder,
  } = useOrderStore();
  const [isReady,setIsReady] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [whatsappOrderId,setWhatsappOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsReady(false);
      setError(null);
      try {
        const capabilities = await checkPermission();
        if (capabilities.canCreateManualOrders) {
          await Promise.all([fetchOrders(),fetchReferenceData()]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossibile caricare gli ordini.');
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [venueId,checkPermission,fetchOrders,fetchReferenceData]);

  const whatsappOrder = useMemo(
    () => orders.find((order) => order.id === whatsappOrderId) || null,
    [orders,whatsappOrderId],
  );

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Eliminare definitivamente la bozza ${code}?`)) return;
    try {
      await deleteDraft(id);
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : 'Eliminazione non riuscita.');
    }
  };

  const handleCancelOrder = async (order: PurchaseOrder) => {
    if (!confirm(
      `Annullare ${order.order_code}? L’azione è irreversibile e bloccherà le operazioni ancora aperte.`,
    )) return;
    try {
      await cancelOrder(order.id,order.version);
    } catch (cancelError) {
      alert(cancelError instanceof Error ? cancelError.message : 'Annullamento non riuscito.');
    }
  };

  if (!isReady) {
    return <div className="py-24 text-center text-muted-foreground">Caricamento ordini…</div>;
  }

  if (!canCreateManualOrders) {
    return (
      <div className="py-24 text-center space-y-4 px-6">
        <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
        <h1 className="text-xl font-black uppercase tracking-tight">Ordini non abilitati</h1>
        <p className="text-sm text-muted-foreground">
          Il tuo account non dispone del permesso Ordini per questo locale.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-accent-orange mb-1">
            <ClipboardList size={18} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Ciclo ordini</span>
          </div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter">Ordini</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Bozze, invii per fornitore e ricezioni manuali.
          </p>
        </div>
        <Link to="/orders/new">
          <Button size="sm" className="gap-2 font-black uppercase text-[10px] tracking-widest">
            <Plus size={15} /> Nuovo
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="p-4 border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">
          {error}
        </Card>
      )}

      {!isLoading && orders.length === 0 ? (
        <Card className="py-16 px-6 text-center border-dashed border-white/10 bg-white/[0.03]">
          <PackageOpen className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-4" />
          <h2 className="font-bold text-white">Nessun ordine</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Crea un ordine e assegna il fornitore riga per riga.
          </p>
          <Link to="/orders/new">
            <Button variant="secondary">Crea ordine manuale</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => {
            const groups = supplierGroups(order);
            const canOperate = !['received','cancelled'].includes(order.status);
            return (
              <Card
                key={order.id}
                data-testid={order.status === 'draft'
                  ? `order-draft-${order.id}`
                  : `order-card-${order.id}`}
                data-order-id={order.id}
                className="p-5 border-white/5 bg-white/5"
              >
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] text-primary font-black tracking-widest uppercase">
                        {order.order_code}
                      </p>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <h2 className="font-bold text-lg truncate mt-1">
                      {order.department?.name || 'Reparto'}
                    </h2>
                    <p className="text-[10px] text-muted-foreground uppercase mt-1">
                      Aggiornato {formatDateTime(order.updated_at)} · v{order.version}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Link to={`/orders/${order.id}/detail`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label={`Dettaglio ${order.order_code}`}
                      >
                        <Eye size={16} />
                      </Button>
                    </Link>
                    {order.status === 'draft' && (
                      <>
                        <Link to={`/orders/${order.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            aria-label={`Modifica ${order.order_code}`}
                          >
                            <Pencil size={16} />
                          </Button>
                        </Link>
                        <Button
                          data-testid={`delete-order-${order.id}`}
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-accent-red"
                          onClick={() => void handleDelete(order.id,order.order_code)}
                          aria-label={`Elimina ${order.order_code}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold">{order.items?.length || 0} righe</span>
                    <span className="text-[9px] text-muted-foreground uppercase">
                      {groups.length} fornitori
                    </span>
                  </div>
                  {groups.map((group) => (
                    <div
                      key={group.supplierId}
                      className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
                        <Truck size={13} className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{group.name}</span>
                      </span>
                      <OrderStatusBadge status={group.status} />
                    </div>
                  ))}
                  {(order.items || []).some((item) => !item.supplier_id) && (
                    <p className="text-[10px] text-accent-orange">Sono presenti righe senza fornitore.</p>
                  )}
                </div>

                {canOperate && groups.length > 0 && (
                  <Button
                    data-testid={`whatsapp-preview-${order.id}`}
                    variant="secondary"
                    className="w-full mt-4 gap-2 text-[10px] font-black uppercase tracking-widest"
                    onClick={() => setWhatsappOrderId(order.id)}
                  >
                    <MessageCircle size={15} /> WhatsApp e conferma invio
                  </Button>
                )}

                {canManageOrders && canOperate && (
                  <Button
                    data-testid={`cancel-order-${order.id}`}
                    variant="ghost"
                    className="w-full mt-2 gap-2 text-[10px] font-black uppercase tracking-widest text-accent-red"
                    onClick={() => void handleCancelOrder(order)}
                  >
                    <Ban size={14} /> Annulla ordine
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {whatsappOrder && (
        <WhatsAppOrderModal
          order={whatsappOrder}
          suppliers={suppliers}
          venueName={venueName}
          canSend={canSendWhatsappOrders}
          onClose={() => setWhatsappOrderId(null)}
          onRecordOpened={recordWhatsappOpened}
          onConfirmSent={confirmSupplierOrder}
        />
      )}
    </div>
  );
}
