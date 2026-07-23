import type { PurchaseOrderStatus, SupplierPurchaseOrderStatus } from '../../types/orders';

type SupportedStatus = PurchaseOrderStatus | SupplierPurchaseOrderStatus;

const labels: Record<SupportedStatus,string> = {
  draft: 'Bozza',
  sent: 'Inviato',
  partially_received: 'Parziale',
  received: 'Ricevuto',
  cancelled: 'Annullato',
  pending: 'Da inviare',
  whatsapp_opened: 'WhatsApp aperto',
  sent_confirmed: 'Invio confermato',
};

const styles: Record<SupportedStatus,string> = {
  draft: 'border-white/10 bg-white/5 text-muted-foreground',
  sent: 'border-primary/30 bg-primary/10 text-primary',
  partially_received: 'border-accent-orange/30 bg-accent-orange/10 text-accent-orange',
  received: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  cancelled: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
  pending: 'border-white/10 bg-white/5 text-muted-foreground',
  whatsapp_opened: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  sent_confirmed: 'border-primary/30 bg-primary/10 text-primary',
};

export function OrderStatusBadge({ status }: { status: SupportedStatus }) {
  return (
    <span
      data-testid={`order-status-${status}`}
      className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
