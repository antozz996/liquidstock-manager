import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, MessageCircle, X } from 'lucide-react';
import { buildWhatsappMessage, buildWhatsappUrl, groupOrderItemsBySupplier, normalizeWhatsappNumber } from '../../lib/orderWhatsapp';
import type { PurchaseOrder, Supplier } from '../../types/orders';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface WhatsAppOrderModalProps {
  order: PurchaseOrder;
  suppliers: Supplier[];
  venueName: string;
  canSend: boolean;
  onClose: () => void;
  onRecordOpened: (input: {
    purchaseOrderId: string;
    supplierId: string;
    orderVersion: number;
    whatsappNumberSnapshot: string;
    messageSnapshot: string;
  }) => Promise<unknown>;
}

export function WhatsAppOrderModal({
  order,
  suppliers,
  venueName,
  canSend,
  onClose,
  onRecordOpened,
}: WhatsAppOrderModalProps) {
  const { assigned, unassigned } = useMemo(() => groupOrderItemsBySupplier(order), [order]);
  const groups = useMemo(() => [...assigned.entries()].map(([supplierId, items]) => {
    const supplier = suppliers.find((candidate) => candidate.id === supplierId);
    return {
      supplierId,
      supplier,
      supplierName: supplier?.name || items[0]?.supplier_name_snapshot || 'Fornitore',
      items,
    };
  }).sort((a, b) => a.supplierName.localeCompare(b.supplierName)), [assigned, suppliers]);
  const [messages, setMessages] = useState<Record<string, string>>(() => Object.fromEntries(
    groups.map((group) => [
      group.supplierId,
      buildWhatsappMessage({
        venueName,
        departmentName: order.department?.name || '',
        requestedDeliveryDate: order.requested_delivery_date,
        generalNotes: order.general_notes,
        items: group.items,
      }),
    ]),
  ));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [openingSupplierId, setOpeningSupplierId] = useState<string | null>(null);

  const copyMessage = async (supplierId: string) => {
    try {
      await navigator.clipboard.writeText(messages[supplierId] || '');
      setOpened((current) => ({ ...current, [supplierId]: true }));
      setErrors((current) => ({ ...current, [supplierId]: '' }));
    } catch {
      setErrors((current) => ({ ...current, [supplierId]: 'Impossibile copiare il testo negli appunti.' }));
    }
  };

  const openWhatsapp = async (supplierId: string, rawNumber: string | null | undefined) => {
    const normalizedNumber = normalizeWhatsappNumber(rawNumber);
    if (!normalizedNumber) {
      setErrors((current) => ({
        ...current,
        [supplierId]: 'Numero WhatsApp mancante o non valido. Puoi comunque copiare il testo.',
      }));
      return;
    }
    if (!canSend) {
      setErrors((current) => ({ ...current, [supplierId]: 'Permesso di apertura WhatsApp non disponibile.' }));
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setErrors((current) => ({ ...current, [supplierId]: 'Il browser ha bloccato la nuova finestra WhatsApp.' }));
      return;
    }
    popup.opener = null;
    setOpeningSupplierId(supplierId);
    setErrors((current) => ({ ...current, [supplierId]: '' }));
    try {
      const message = messages[supplierId] || '';
      await onRecordOpened({
        purchaseOrderId: order.id,
        supplierId,
        orderVersion: order.version,
        whatsappNumberSnapshot: normalizedNumber,
        messageSnapshot: message,
      });
      popup.location.href = buildWhatsappUrl(normalizedNumber, message);
      setOpened((current) => ({ ...current, [supplierId]: true }));
    } catch (error) {
      popup.close();
      setErrors((current) => ({
        ...current,
        [supplierId]: error instanceof Error ? error.message : 'Apertura WhatsApp non registrata.',
      }));
    } finally {
      setOpeningSupplierId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-green">Anteprima modificabile</p>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter">WhatsApp per fornitore</h2>
            <p className="text-xs text-muted-foreground mt-1">{order.order_code} · versione {order.version}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Chiudi anteprima WhatsApp">
            <X size={20} />
          </Button>
        </div>

        {!canSend && (
          <Card className="p-4 border-accent-orange/30 bg-accent-orange/10 text-sm text-accent-orange">
            Puoi leggere e copiare le anteprime, ma non hai il permesso per aprire WhatsApp.
          </Card>
        )}

        {unassigned.length > 0 && (
          <Card className="p-4 border-accent-orange/30 bg-accent-orange/10 flex gap-3">
            <AlertTriangle size={18} className="text-accent-orange shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Righe senza fornitore: {unassigned.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Queste righe restano nella bozza e non generano un messaggio WhatsApp.</p>
            </div>
          </Card>
        )}

        {groups.length === 0 && (
          <Card className="p-8 text-center border-dashed border-white/10">
            <p className="font-bold">Nessun fornitore assegnato</p>
            <p className="text-xs text-muted-foreground mt-1">Assegna almeno una riga a un fornitore per creare l’anteprima.</p>
          </Card>
        )}

        {groups.map((group) => {
          const normalizedNumber = normalizeWhatsappNumber(group.supplier?.whatsapp_number);
          return (
            <Card key={group.supplierId} data-testid={`whatsapp-group-${group.supplierId}`} className="p-5 space-y-4 border-white/10 bg-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageCircle size={17} className="text-accent-green" />
                    <h3 className="font-black uppercase tracking-tight">{group.supplierName}</h3>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {normalizedNumber ? `wa.me/${normalizedNumber}` : 'Numero WhatsApp non disponibile'}
                  </p>
                </div>
                {opened[group.supplierId] && (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase text-accent-green">
                    <CheckCircle2 size={12} /> Azione completata
                  </span>
                )}
              </div>

              <textarea
                data-testid={`whatsapp-message-${group.supplierId}`}
                value={messages[group.supplierId] || ''}
                onChange={(event) => setMessages((current) => ({ ...current, [group.supplierId]: event.target.value }))}
                rows={Math.min(14, Math.max(8, (messages[group.supplierId] || '').split('\n').length + 1))}
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-3 text-sm text-white font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={`Messaggio per ${group.supplierName}`}
              />

              {errors[group.supplierId] && (
                <p className="text-xs text-accent-red" role="alert">{errors[group.supplierId]}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button variant="secondary" className="gap-2" onClick={() => void copyMessage(group.supplierId)}>
                  <Copy size={15} /> Copia testo
                </Button>
                <Button
                  data-testid={`open-whatsapp-${group.supplierId}`}
                  className="gap-2"
                  disabled={!canSend || openingSupplierId === group.supplierId}
                  onClick={() => void openWhatsapp(group.supplierId, group.supplier?.whatsapp_number)}
                >
                  <ExternalLink size={15} />
                  {openingSupplierId === group.supplierId ? 'Registrazione…' : 'Invia su WhatsApp'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
