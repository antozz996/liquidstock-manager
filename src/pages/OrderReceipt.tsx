import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, PackageCheck, Save } from 'lucide-react';
import { OrderStatusBadge } from '../components/orders/OrderStatusBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../store/useAuthStore';
import { useOrderStore } from '../store/useOrderStore';
import type { SupplierPurchaseOrder, SupplierPurchaseOrderItem } from '../types/orders';

interface ReceiptValue {
  receivedQuantity: string;
  note: string;
}

export default function OrderReceipt() {
  const navigate = useNavigate();
  const { orderId,supplierOrderId } = useParams();
  const { venueId } = useAuthStore();
  const {
    checkPermission,
    fetchOrder,
    recordSupplierReceipt,
  } = useOrderStore();
  const [supplierOrder,setSupplierOrder] = useState<SupplierPurchaseOrder | null>(null);
  const [orderVersion,setOrderVersion] = useState(0);
  const [values,setValues] = useState<Record<string,ReceiptValue>>({});
  const [requestKey] = useState(() => crypto.randomUUID());
  const [loadState,setLoadState] = useState<'loading' | 'ready' | 'missing' | 'forbidden'>('loading');
  const [isSaving,setIsSaving] = useState(false);
  const [error,setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId || !supplierOrderId) {
      setLoadState('missing');
      return;
    }
    setLoadState('loading');
    try {
      const capabilities = await checkPermission();
      if (!capabilities.canManageOrders) {
        setLoadState('forbidden');
        return;
      }
      const order = await fetchOrder(orderId);
      const tracked = order?.supplier_orders?.find(
        (candidate) => candidate.id === supplierOrderId,
      );
      if (!order || !tracked || !['sent_confirmed','partially_received'].includes(tracked.status)) {
        setLoadState('missing');
        return;
      }
      const snapshots = [...(tracked.snapshot_items || [])].sort((a,b) => a.position-b.position);
      if (snapshots.length === 0) {
        setLoadState('missing');
        return;
      }
      const latestReceipt = [...(tracked.receipts || [])].sort(
        (a,b) => b.created_at.localeCompare(a.created_at),
      )[0];
      setValues(Object.fromEntries(snapshots.map((item) => {
        const latestItem = latestReceipt?.items?.find(
          (candidate) => candidate.supplier_purchase_order_item_id === item.id,
        );
        return [item.id,{
          receivedQuantity: latestItem ? String(latestItem.received_quantity) : '0',
          note: latestItem?.note || '',
        }];
      })));
      setOrderVersion(order.version);
      setSupplierOrder(tracked);
      setLoadState('ready');
    } catch {
      setLoadState('missing');
    }
  }, [checkPermission,fetchOrder,orderId,supplierOrderId]);

  useEffect(() => {
    void load();
  }, [load,venueId]);

  const snapshots = useMemo(
    () => [...(supplierOrder?.snapshot_items || [])].sort((a,b) => a.position-b.position),
    [supplierOrder],
  );

  const updateValue = (itemId: string, updates: Partial<ReceiptValue>) => {
    setValues((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] || { receivedQuantity: '0',note: '' }),...updates },
    }));
  };

  const setAll = (mode: 'complete' | 'zero') => {
    setValues((current) => Object.fromEntries(snapshots.map((item) => [
      item.id,
      {
        receivedQuantity: mode === 'complete' ? String(item.quantity) : '0',
        note: current[item.id]?.note || '',
      },
    ])));
  };

  const receivedNumber = (item: SupplierPurchaseOrderItem) => {
    const parsed = Number((values[item.id]?.receivedQuantity || '').replace(',','.'));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };

  const submit = async () => {
    if (!supplierOrder) return;
    for (const item of snapshots) {
      const received = receivedNumber(item);
      if (!Number.isFinite(received) || received < 0) {
        setError(`Quantità ricevuta non valida per ${item.product_name_snapshot}.`);
        return;
      }
    }
    const complete = snapshots.every((item) => receivedNumber(item) >= Number(item.quantity));
    if (!confirm(
      `Registrare una ricezione ${complete ? 'completa' : 'parziale'}? La dichiarazione verrà conservata nello storico.`,
    )) return;

    setIsSaving(true);
    setError(null);
    try {
      await recordSupplierReceipt({
        supplierPurchaseOrderId: supplierOrder.id,
        orderVersion,
        idempotencyKey: requestKey,
        items: snapshots.map((item) => ({
          supplierOrderItemId: item.id,
          receivedQuantity: values[item.id]?.receivedQuantity || '0',
          note: values[item.id]?.note || '',
        })),
      });
      navigate(`/orders/${orderId}/detail`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Ricezione non registrata.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadState === 'loading') {
    return <div className="py-24 text-center text-muted-foreground">Caricamento ricezione…</div>;
  }
  if (loadState === 'forbidden') {
    return <div className="py-24 text-center text-muted-foreground">Permesso gestione ordini non disponibile.</div>;
  }
  if (loadState === 'missing' || !supplierOrder) {
    return <div className="py-24 text-center text-muted-foreground">Sotto-ordine non ricevibile o non accessibile.</div>;
  }

  const isComplete = snapshots.every((item) => receivedNumber(item) >= Number(item.quantity));

  return (
    <div className="space-y-6 pt-4 pb-32" data-testid="order-receipt-page">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={() => navigate(`/orders/${orderId}/detail`)}
        >
          <ArrowLeft size={20} />
        </Button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-accent-green">
            Ricezione manuale
          </p>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter">
            {supplierOrder.supplier_name_snapshot || supplierOrder.supplier?.name || 'Fornitore'}
          </h1>
          <div className="mt-2"><OrderStatusBadge status={supplierOrder.status} /></div>
        </div>
      </div>

      <Card className="p-4 border-primary/20 bg-primary/5 text-xs text-muted-foreground">
        Inserisci quantità cumulative effettivamente ricevute. Nessun valore aggiornerà la giacenza.
        Le quantità superiori all’ordinato sono consentite e saranno evidenziate.
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="text-[10px] uppercase font-black" onClick={() => setAll('complete')}>
          Tutto ricevuto
        </Button>
        <Button variant="outline" className="text-[10px] uppercase font-black" onClick={() => setAll('zero')}>
          Nulla consegnato
        </Button>
      </div>

      <div className="space-y-3">
        {snapshots.map((item) => {
          const received = receivedNumber(item);
          const ordered = Number(item.quantity);
          const missing = Number.isFinite(received) ? Math.max(ordered-received,0) : ordered;
          const over = Number.isFinite(received) && received>ordered;
          return (
            <Card
              key={item.id}
              data-testid={`receipt-item-${item.id}`}
              className={`p-4 space-y-4 ${over ? 'border-accent-orange/40 bg-accent-orange/5' : 'border-white/5 bg-white/5'}`}
            >
              <div className="flex justify-between gap-3">
                <div>
                  <h2 className="font-bold">{item.product_name_snapshot}</h2>
                  {item.package_note && (
                    <p className="text-[10px] text-muted-foreground mt-1">{item.package_note}</p>
                  )}
                </div>
                <span className="text-xs whitespace-nowrap">
                  Ordinati <strong>{item.quantity} {item.unit}</strong>
                </span>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  Quantità ricevuta
                </label>
                <Input
                  data-field="received-quantity"
                  type="text"
                  inputMode="decimal"
                  value={values[item.id]?.receivedQuantity || ''}
                  onChange={(event) => updateValue(item.id,{ receivedQuantity: event.target.value })}
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  Nota
                </label>
                <Input
                  data-field="receipt-note"
                  value={values[item.id]?.note || ''}
                  onChange={(event) => updateValue(item.id,{ note: event.target.value })}
                  placeholder="Facoltativa"
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-xs">
                <span className={missing > 0 ? 'text-accent-orange' : 'text-accent-green'}>
                  Mancanti: <strong>{missing}</strong>
                </span>
                {over ? (
                  <span className="flex items-center gap-1 text-accent-orange font-bold">
                    <AlertTriangle size={13} /> Superiore all’ordinato
                  </span>
                ) : received === 0 ? (
                  <span className="text-muted-foreground">Non consegnato</span>
                ) : received >= ordered ? (
                  <span className="flex items-center gap-1 text-accent-green">
                    <CheckCircle2 size={13} /> Completo
                  </span>
                ) : (
                  <span className="text-accent-orange">Parziale</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {error && (
        <Card className="p-4 border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">
          {error}
        </Card>
      )}

      <div className="fixed bottom-20 left-0 right-0 px-4 pointer-events-none z-40">
        <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto pointer-events-auto">
          <Button
            data-testid="save-order-receipt"
            className="w-full h-14 gap-2 font-black uppercase tracking-widest shadow-2xl shadow-primary/20"
            disabled={isSaving}
            onClick={() => void submit()}
          >
            {isComplete ? <PackageCheck size={18} /> : <Save size={18} />}
            {isSaving ? 'Registrazione…' : isComplete ? 'Registra ricezione completa' : 'Registra ricezione parziale'}
          </Button>
        </div>
      </div>
    </div>
  );
}
