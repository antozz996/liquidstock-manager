import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Box, PackagePlus, Plus, Save, Search, Trash2, Truck, UserPlus, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../store/useAuthStore';
import { useOrderStore } from '../store/useOrderStore';
import type { ManualOrderDraftItem, PurchaseOrderItem } from '../types/orders';

const unitSuggestions = ['pz','bottiglia','cartone','confezione','box','kg','g','l','ml'];

const newClientId = () => crypto.randomUUID();
const emptyFreeItem = (): ManualOrderDraftItem => ({
  client_id: newClientId(),
  product_id: null,
  product_name_snapshot: '',
  quantity: '1',
  unit: 'pz',
  package_note: '',
  supplier_id: null,
  supplier_name_snapshot: '',
  supplier_note: '',
});

const fromSavedItem = (item: PurchaseOrderItem): ManualOrderDraftItem => ({
  client_id: item.id,
  product_id: item.product_id,
  product_name_snapshot: item.product_name_snapshot,
  quantity: String(item.quantity),
  unit: item.unit,
  package_note: item.package_note || '',
  supplier_id: item.supplier_id,
  supplier_name_snapshot: item.supplier_name_snapshot || '',
  supplier_note: item.supplier_note || '',
});

export default function ManualOrder() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { venueId } = useAuthStore();
  const {
    departments,
    suppliers,
    products,
    isLoading,
    checkPermission,
    fetchReferenceData,
    fetchDraft,
    saveDraft,
    createSupplier,
  } = useOrderStore();
  const [departmentId, setDepartmentId] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [version, setVersion] = useState<number | undefined>();
  const [items, setItems] = useState<ManualOrderDraftItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'forbidden' | 'missing'>('loading');
  const [formError, setFormError] = useState<string | null>(null);
  const [quickSupplierFor, setQuickSupplierFor] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierWhatsapp, setSupplierWhatsapp] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadState('loading');
      try {
        const capabilities = await checkPermission();
        if (!capabilities.canCreateManualOrders) {
          if (!cancelled) setLoadState('forbidden');
          return;
        }
        await fetchReferenceData();
        if (orderId) {
          const draft = await fetchDraft(orderId);
          if (!draft) {
            if (!cancelled) setLoadState('missing');
            return;
          }
          if (!cancelled) {
            setDepartmentId(draft.department_id);
            setGeneralNotes(draft.general_notes || '');
            setDeliveryDate(draft.requested_delivery_date || '');
            setVersion(draft.version);
            setItems((draft.items || []).sort((a,b) => a.position-b.position).map(fromSavedItem));
          }
        } else if (!cancelled) {
          const currentDepartments = useOrderStore.getState().departments;
          setDepartmentId(currentDepartments[0]?.id || '');
          setItems([emptyFreeItem()]);
        }
        if (!cancelled) setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('missing');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [orderId,venueId,checkPermission,fetchReferenceData,fetchDraft]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products.slice(0,8);
    return products.filter((product) =>
      product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query)
    ).slice(0,8);
  }, [productSearch,products]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string,{ label: string; items: ManualOrderDraftItem[] }>();
    for (const item of items) {
      const key = item.supplier_id || '__unassigned__';
      const label = item.supplier_name_snapshot || 'Da assegnare';
      const group = groups.get(key) || { label, items: [] };
      group.items.push(item);
      groups.set(key,group);
    }
    return [...groups.entries()].sort(([keyA,{ label: labelA }],[keyB,{ label: labelB }]) => {
      if (keyA === '__unassigned__') return 1;
      if (keyB === '__unassigned__') return -1;
      return labelA.localeCompare(labelB);
    });
  }, [items]);

  const updateItem = (clientId: string, updates: Partial<ManualOrderDraftItem>) => {
    setItems((current) => current.map((item) => item.client_id===clientId ? { ...item,...updates } : item));
  };

  const addProduct = (productId: string) => {
    const product = products.find((candidate) => candidate.id===productId);
    if (!product) return;
    setItems((current) => [...current,{
      client_id: newClientId(),
      product_id: product.id,
      product_name_snapshot: product.name,
      quantity: '1',
      unit: product.unit || 'pz',
      package_note: '',
      supplier_id: null,
      supplier_name_snapshot: '',
      supplier_note: '',
    }]);
    setProductSearch('');
  };

  const selectSupplier = (clientId: string, supplierId: string) => {
    const supplier = suppliers.find((candidate) => candidate.id===supplierId);
    updateItem(clientId,{
      supplier_id: supplier?.id || null,
      supplier_name_snapshot: supplier?.name || '',
    });
  };

  const handleQuickSupplier = async () => {
    if (!supplierName.trim() || !quickSupplierFor) return;
    try {
      const supplier = await createSupplier({
        name: supplierName,
        contactName: supplierContact,
        whatsappNumber: supplierWhatsapp,
      });
      updateItem(quickSupplierFor,{
        supplier_id: supplier.id,
        supplier_name_snapshot: supplier.name,
      });
      setQuickSupplierFor(null);
      setSupplierName('');
      setSupplierContact('');
      setSupplierWhatsapp('');
    } catch (supplierError) {
      alert(supplierError instanceof Error ? supplierError.message : 'Creazione fornitore non riuscita.');
    }
  };

  const validate = () => {
    if (!departmentId) return 'Seleziona un reparto.';
    if (items.length===0) return 'Inserisci almeno una riga.';
    for (const item of items) {
      if (!item.product_name_snapshot.trim()) return 'Ogni riga deve avere un prodotto o una descrizione libera.';
      const quantity = Number(item.quantity.replace(',','.'));
      if (!Number.isFinite(quantity) || quantity<=0) return `Quantità non valida per ${item.product_name_snapshot}.`;
      if (!item.unit.trim()) return `Inserisci l’unità per ${item.product_name_snapshot}.`;
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    try {
      await saveDraft({
        id: orderId,
        expectedVersion: version,
        departmentId,
        generalNotes,
        requestedDeliveryDate: deliveryDate,
        items: items.map((item) => ({ ...item,quantity: item.quantity.replace(',','.') })),
      });
      navigate('/orders');
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Salvataggio non riuscito.');
    }
  };

  if (loadState==='loading') return <div className="py-24 text-center text-muted-foreground">Caricamento bozza…</div>;
  if (loadState==='forbidden') return <div className="py-24 text-center text-muted-foreground">Permesso ordini manuali non disponibile.</div>;
  if (loadState==='missing') return <div className="py-24 text-center text-muted-foreground">Bozza non trovata o non accessibile.</div>;

  return (
    <div className="space-y-6 pt-4 pb-32" data-testid="manual-order-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate('/orders')}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-accent-orange">Modalità manuale</p>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter">{orderId ? 'Modifica bozza' : 'Nuovo ordine'}</h1>
        </div>
      </div>

      <Card className="p-5 space-y-4 border-white/5 bg-white/5">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Reparto</label>
          <select data-testid="order-department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="w-full h-12 rounded-lg bg-card border border-muted px-3 text-sm text-white">
            <option value="">Seleziona reparto</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Consegna richiesta</label>
          <Input data-testid="order-delivery-date" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Note generali</label>
          <textarea data-testid="order-general-notes" value={generalNotes} onChange={(event) => setGeneralNotes(event.target.value)} rows={3} className="w-full rounded-lg bg-card border border-muted px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Indicazioni libere per l’ordine" />
        </div>
      </Card>

      <Card className="p-5 border-white/5 bg-white/[0.03]">
        <div className="flex items-center gap-2 mb-3"><Search size={16} className="text-primary" /><h2 className="font-black uppercase text-sm tracking-wide">Aggiungi prodotto</h2></div>
        <Input data-testid="order-product-search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Cerca nell’anagrafica…" />
        <div className="grid gap-1 mt-2 max-h-48 overflow-y-auto">
          {filteredProducts.map((product) => (
            <button key={product.id} data-testid={`add-product-${product.id}`} onClick={() => addProduct(product.id)} className="text-left px-3 py-2 rounded-lg hover:bg-white/10 flex justify-between gap-3">
              <span className="text-sm font-bold">{product.name}</span>
              <span className="text-[9px] uppercase text-muted-foreground">{product.category}</span>
            </button>
          ))}
        </div>
        <Button data-testid="add-free-order-item" variant="outline" className="w-full mt-3 gap-2" onClick={() => setItems((current) => [...current,emptyFreeItem()])}>
          <PackagePlus size={16} /> Inserisci riga libera
        </Button>
      </Card>

      <div className="space-y-6">
        {groupedItems.map(([groupKey,group]) => (
          <section key={groupKey} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Truck size={15} className={groupKey==='__unassigned__' ? 'text-muted-foreground' : 'text-accent-green'} />
              <h2 className="text-xs font-black uppercase tracking-[0.16em]">{group.label}</h2>
              <span className="text-[9px] text-muted-foreground">{group.items.length} righe</span>
            </div>
            {group.items.map((item) => (
              <Card key={item.client_id} data-testid="order-item" data-client-id={item.client_id} className="p-4 space-y-4 border-white/5 bg-white/5">
                <div className="flex justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Box size={17} className="text-primary shrink-0" />
                    {item.product_id ? (
                      <div className="min-w-0"><p className="font-bold truncate">{item.product_name_snapshot}</p><p className="text-[9px] uppercase text-primary">Prodotto anagrafica</p></div>
                    ) : (
                      <Input data-field="product-name" value={item.product_name_snapshot} onChange={(event) => updateItem(item.client_id,{ product_name_snapshot: event.target.value })} placeholder="Descrizione riga libera" className="h-10" />
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-accent-red" onClick={() => setItems((current) => current.filter((row) => row.client_id!==item.client_id))}>
                    <Trash2 size={15} />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Quantità</label><Input data-field="quantity" type="text" inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(item.client_id,{ quantity: event.target.value })} /></div>
                  <div><label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Unità</label><Input data-field="unit" list="order-unit-suggestions" value={item.unit} onChange={(event) => updateItem(item.client_id,{ unit: event.target.value })} /></div>
                </div>
                <div><label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Formato / confezione</label><Input data-field="package-note" value={item.package_note} onChange={(event) => updateItem(item.client_id,{ package_note: event.target.value })} placeholder="Es. cartone da 6 × 1 L" /></div>
                <div>
                  <div className="flex justify-between items-center mb-1"><label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Fornitore</label><button data-action="quick-supplier" className="text-[9px] uppercase font-black text-primary flex items-center gap-1" onClick={() => setQuickSupplierFor(item.client_id)}><UserPlus size={11} /> Nuovo</button></div>
                  <select data-field="supplier" value={item.supplier_id || ''} onChange={(event) => selectSupplier(item.client_id,event.target.value)} className="w-full h-12 rounded-lg bg-card border border-muted px-3 text-sm text-white">
                    <option value="">Da assegnare</option>
                    {suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </div>
                <div><label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Nota fornitore</label><Input value={item.supplier_note} onChange={(event) => updateItem(item.client_id,{ supplier_note: event.target.value })} placeholder="Indicazione facoltativa" /></div>
              </Card>
            ))}
          </section>
        ))}
      </div>

      <datalist id="order-unit-suggestions">{unitSuggestions.map((unit) => <option key={unit} value={unit} />)}</datalist>

      {formError && <Card className="p-4 border-accent-red/30 bg-accent-red/10 text-sm text-accent-red">{formError}</Card>}

      <div className="fixed bottom-20 left-0 right-0 px-4 pointer-events-none z-40">
        <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto pointer-events-auto">
          <Button data-testid="save-order-draft" className="w-full h-14 gap-2 font-black uppercase tracking-widest shadow-2xl shadow-primary/20" disabled={isLoading} onClick={() => void handleSave()}>
            <Save size={18} /> {isLoading ? 'Salvataggio…' : 'Salva bozza'}
          </Button>
        </div>
      </div>

      {quickSupplierFor && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
          <Card className="w-full max-w-sm p-5 space-y-4 border-white/10">
            <div className="flex justify-between items-center"><h2 className="font-black uppercase tracking-tight">Nuovo fornitore</h2><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuickSupplierFor(null)}><X size={17} /></Button></div>
            <Input data-testid="quick-supplier-name" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Nome fornitore *" autoFocus />
            <Input data-testid="quick-supplier-contact" value={supplierContact} onChange={(event) => setSupplierContact(event.target.value)} placeholder="Referente" />
            <Input data-testid="quick-supplier-whatsapp" value={supplierWhatsapp} onChange={(event) => setSupplierWhatsapp(event.target.value)} placeholder="Numero WhatsApp (facoltativo)" />
            <p className="text-[10px] text-muted-foreground">Il numero verrà usato soltanto per preparare un link WhatsApp avviato manualmente.</p>
            <Button data-testid="create-quick-supplier" className="w-full gap-2" disabled={!supplierName.trim()} onClick={() => void handleQuickSupplier()}><Plus size={16} /> Crea e assegna</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
