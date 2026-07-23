import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, MessageCircle, PackageOpen, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { WhatsAppOrderModal } from '../components/orders/WhatsAppOrderModal';
import { formatDateTime } from '../lib/formatters';
import { useAuthStore } from '../store/useAuthStore';
import { useOrderStore } from '../store/useOrderStore';

export default function Orders() {
  const { venueId } = useAuthStore();
  const {
    drafts,
    suppliers,
    venueName,
    canCreateManualOrders,
    canSendWhatsappOrders,
    isLoading,
    checkPermission,
    fetchDrafts,
    fetchReferenceData,
    deleteDraft,
    recordWhatsappOpened,
  } = useOrderStore();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsappOrderId, setWhatsappOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsReady(false);
      setError(null);
      try {
        const capabilities = await checkPermission();
        if (capabilities.canCreateManualOrders) {
          await Promise.all([fetchDrafts(), fetchReferenceData()]);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Impossibile caricare le bozze.');
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [venueId,checkPermission,fetchDrafts,fetchReferenceData]);

  const whatsappOrder = drafts.find((draft) => draft.id === whatsappOrderId) || null;

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Eliminare definitivamente la bozza ${code}?`)) return;
    try {
      await deleteDraft(id);
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : 'Eliminazione non riuscita.');
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
        <p className="text-sm text-muted-foreground">Il tuo account non dispone del permesso per creare ordini manuali in questo locale.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-accent-orange mb-1">
            <ClipboardList size={18} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Modulo ordini</span>
          </div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter">Bozze ordini</h1>
          <p className="text-xs text-muted-foreground mt-1">Ordini manuali, anche senza giacenza completa.</p>
        </div>
        <Link to="/orders/new">
          <Button size="sm" className="gap-2 font-black uppercase text-[10px] tracking-widest">
            <Plus size={15} /> Nuovo
          </Button>
        </Link>
      </div>

      {error && <Card className="p-4 border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">{error}</Card>}

      {!isLoading && drafts.length === 0 ? (
        <Card className="py-16 px-6 text-center border-dashed border-white/10 bg-white/[0.03]">
          <PackageOpen className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-4" />
          <h2 className="font-bold text-white">Nessuna bozza</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Crea un ordine e assegna il fornitore riga per riga.</p>
          <Link to="/orders/new"><Button variant="secondary">Crea ordine manuale</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {drafts.map((draft) => {
            const supplierNames = [...new Set((draft.items || []).map((item) => item.supplier_name_snapshot || 'Da assegnare'))];
            return (
              <Card key={draft.id} data-testid={`order-draft-${draft.id}`} className="p-5 border-white/5 bg-white/5">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] text-primary font-black tracking-widest uppercase">{draft.order_code}</p>
                    <h2 className="font-bold text-lg truncate">{draft.department?.name || 'Reparto'}</h2>
                    <p className="text-[10px] text-muted-foreground uppercase mt-1">
                      Aggiornato {formatDateTime(draft.updated_at)} · v{draft.version}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Link to={`/orders/${draft.id}`}>
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Modifica ${draft.order_code}`}>
                        <Pencil size={16} />
                      </Button>
                    </Link>
                    <Button
                      data-testid={`delete-order-${draft.id}`}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-accent-red"
                      onClick={() => void handleDelete(draft.id,draft.order_code)}
                      aria-label={`Elimina ${draft.order_code}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold">{draft.items?.length || 0} righe</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                    <Truck size={12} className="shrink-0" />
                    <span className="truncate">{supplierNames.join(' · ') || 'Nessun fornitore'}</span>
                  </div>
                </div>
                <Button
                  data-testid={`whatsapp-preview-${draft.id}`}
                  variant="secondary"
                  className="w-full mt-4 gap-2 text-[10px] font-black uppercase tracking-widest"
                  onClick={() => setWhatsappOrderId(draft.id)}
                >
                  <MessageCircle size={15} /> Anteprima WhatsApp
                </Button>
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
        />
      )}
    </div>
  );
}
