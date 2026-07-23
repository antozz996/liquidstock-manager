import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { CheckCircle2, Key, Save, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import { formatDateTime } from "../lib/formatters";
import { createStaffInvite } from "../lib/registrationInvites";
import type { OrderPermission } from "../types/orders";

interface TeamProfile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'staff' | 'super_admin' | 'osservatore';
  updated_at: string | null;
}

type EditableOrderPermission = Pick<
  OrderPermission,
  | 'can_create_manual_orders'
  | 'can_create_stock_orders'
  | 'can_manage_orders'
  | 'can_send_whatsapp_orders'
  | 'can_view_purchase_prices'
  | 'is_active'
>;

const emptyOrderPermission = (): EditableOrderPermission => ({
  can_create_manual_orders: false,
  can_create_stock_orders: false,
  can_manage_orders: false,
  can_send_whatsapp_orders: false,
  can_view_purchase_prices: false,
  is_active: true,
});

const permissionFields: Array<{ key: keyof EditableOrderPermission; label: string; note: string }> = [
  { key: 'can_create_manual_orders', label: 'Ordini manuali', note: 'Crea e modifica le proprie bozze' },
  { key: 'can_create_stock_orders', label: 'Ordini da giacenza', note: 'Predisposto per uno sprint futuro' },
  { key: 'can_manage_orders', label: 'Gestione ordini', note: 'Gestisce bozze, ricezioni e annullamenti' },
  { key: 'can_send_whatsapp_orders', label: 'Invio WhatsApp', note: 'Apre il messaggio e ne conferma manualmente l’invio' },
  { key: 'can_view_purchase_prices', label: 'Visualizza prezzi', note: 'Predisposto; i prezzi restano nascosti' },
  { key: 'is_active', label: 'Accesso Ordini attivo', note: 'Se disattivo, nasconde e blocca il modulo' },
];

export default function Settings() {
  const { role, venueId } = useAuthStore();
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [validatedVenueId, setValidatedVenueId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [orderPermissions, setOrderPermissions] = useState<Record<string, EditableOrderPermission>>({});
  const [permissionSaveStatus, setPermissionSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error' | null>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setProfiles([]);
    setValidatedVenueId(null);
    setLoadError(null);
    setOrderPermissions({});

    if (!venueId) {
      setIsLoading(false);
      return;
    }

    const { data: accessibleVenues, error: venueError } = await supabase.rpc('get_my_accessible_venues');
    const isAuthorized = !venueError && (accessibleVenues || []).some((venue: { id: string }) => venue.id === venueId);
    if (!isAuthorized) {
      setLoadError("Il locale selezionato non è autorizzato per questo account.");
      setIsLoading(false);
      return;
    }

    const { data: accessRows, error: accessError } = await supabase
      .from('venue_access')
      .select('user_id')
      .eq('venue_id', venueId);
    if (accessError) {
      setLoadError("Impossibile caricare le associazioni del team.");
      setIsLoading(false);
      return;
    }

    const userIds = [...new Set((accessRows || []).map((item) => item.user_id))];
    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role, updated_at')
        .in('id', userIds)
        .order('role', { ascending: true });
      if (profileError) {
        setLoadError("Impossibile caricare i profili del team.");
        setIsLoading(false);
        return;
      }
      const loadedProfiles = (profileRows || []) as TeamProfile[];
      setProfiles(loadedProfiles);

      const { data: permissionRows, error: permissionError } = await supabase
        .from('order_permissions')
        .select('user_id, can_create_manual_orders, can_create_stock_orders, can_manage_orders, can_send_whatsapp_orders, can_view_purchase_prices, is_active')
        .eq('venue_id', venueId);
      if (permissionError) {
        setLoadError("Impossibile caricare i permessi Ordini.");
        setIsLoading(false);
        return;
      }
      const permissionsByUser = Object.fromEntries(loadedProfiles.map((profile) => {
        const saved = (permissionRows || []).find((row) => row.user_id === profile.id);
        return [profile.id, saved ? {
          can_create_manual_orders: saved.can_create_manual_orders,
          can_create_stock_orders: saved.can_create_stock_orders,
          can_manage_orders: saved.can_manage_orders,
          can_send_whatsapp_orders: saved.can_send_whatsapp_orders,
          can_view_purchase_prices: saved.can_view_purchase_prices,
          is_active: saved.is_active,
        } : emptyOrderPermission()];
      }));
      setOrderPermissions(permissionsByUser);
    }

    setValidatedVenueId(venueId);
    setIsLoading(false);
  }, [venueId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreateInvite = async () => {
    if (!venueId || validatedVenueId !== venueId) {
      alert("Il locale selezionato non è autorizzato.");
      return;
    }
    setIsCreatingInvite(true);
    try {
      const invite = await createStaffInvite(venueId);
      await navigator.clipboard.writeText(`Ciao! Usa questo invito monouso entro 24 ore: ${invite.link}`);
      alert("✅ Invito monouso copiato negli appunti.");
    } catch {
      alert("Errore durante la creazione dell’invito.");
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleDeleteProfile = async (id: string, pRole: string) => {
    const isMe = id === useAuthStore.getState().user?.id;
    
    if (isMe) {
      alert("Non puoi eliminare il tuo stesso account da qui.");
      return;
    }

    if (role === 'admin' && pRole === 'admin') {
      alert("Un amministratore non può eliminarne un altro. Solo il Super Admin può farlo.");
      return;
    }

    if (!confirm("Sei sicuro di voler eliminare questo profilo? L'utente perderà l'accesso a questo locale immediatamente.")) return;
    
    if (!venueId || validatedVenueId !== venueId) {
      alert("Il locale selezionato non è autorizzato.");
      return;
    }

    const { error } = await supabase.rpc('remove_user_from_venue', { p_user_id: id, p_venue_id: validatedVenueId });
    if (!error) fetchData();
    else alert("Errore durante l'eliminazione.");
  };

  const updatePermission = (userId: string, key: keyof EditableOrderPermission, value: boolean) => {
    setOrderPermissions((current) => ({
      ...current,
      [userId]: { ...(current[userId] || emptyOrderPermission()), [key]: value },
    }));
    setPermissionSaveStatus((current) => ({ ...current, [userId]: null }));
  };

  const saveOrderPermissions = async (userId: string) => {
    if (!venueId || validatedVenueId !== venueId) {
      setPermissionSaveStatus((current) => ({ ...current, [userId]: 'error' }));
      return;
    }
    const permission = orderPermissions[userId] || emptyOrderPermission();
    setPermissionSaveStatus((current) => ({ ...current, [userId]: 'saving' }));
    const { data, error } = await supabase.rpc('set_order_permissions', {
      p_venue_id: venueId,
      p_user_id: userId,
      p_can_create_manual_orders: permission.can_create_manual_orders,
      p_can_create_stock_orders: permission.can_create_stock_orders,
      p_can_manage_orders: permission.can_manage_orders,
      p_can_send_whatsapp_orders: permission.can_send_whatsapp_orders,
      p_can_view_purchase_prices: permission.can_view_purchase_prices,
      p_is_active: permission.is_active,
    });
    if (error || !data) {
      setPermissionSaveStatus((current) => ({ ...current, [userId]: 'error' }));
      return;
    }
    const saved = data as OrderPermission;
    setOrderPermissions((current) => ({
      ...current,
      [userId]: {
        can_create_manual_orders: saved.can_create_manual_orders,
        can_create_stock_orders: saved.can_create_stock_orders,
        can_manage_orders: saved.can_manage_orders,
        can_send_whatsapp_orders: saved.can_send_whatsapp_orders,
        can_view_purchase_prices: saved.can_view_purchase_prices,
        is_active: saved.is_active,
      },
    }));
    setPermissionSaveStatus((current) => ({ ...current, [userId]: 'saved' }));
  };

  if (role !== 'admin' && role !== 'super_admin') {
    return <div className="pt-20 text-center text-muted-foreground">Accesso riservato agli amministratori.</div>;
  }

  if (!venueId && role === 'super_admin') {
    return (
      <div className="pt-24 text-center space-y-4 px-6">
        <div className="w-16 h-16 bg-accent-orange/10 rounded-full flex items-center justify-center text-accent-orange mx-auto">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-xl font-bold text-white uppercase italic tracking-tighter">Seleziona una struttura</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Per gestire il team o il codice di registrazione, seleziona prima una struttura dal menu in alto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Users className="text-primary w-5 h-5" />
        <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">Gestione Team</h1>
      </div>

      <Card className="p-5 border-white/10 bg-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Key size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg leading-tight uppercase tracking-tight">Invito staff</h3>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none mt-1">Monouso, revocabile e con scadenza</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            variant="secondary" 
            className="w-full text-[10px] font-black uppercase tracking-widest h-10 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            onClick={handleCreateInvite}
            disabled={isCreatingInvite || isLoading}
          >
            {isCreatingInvite ? "Creazione…" : "Crea e copia invito staff"}
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Membri del Team ({profiles.length})</h3>
        {loadError && (
          <Card className="p-4 border-accent-red/20 bg-accent-red/10 text-sm text-accent-red">
            {loadError}
          </Card>
        )}
        <div className="grid grid-cols-1 gap-2">
          {profiles.map(p => {
            const permission = orderPermissions[p.id] || emptyOrderPermission();
            const permissionStatus = permissionSaveStatus[p.id];
            return (
              <Card key={p.id} data-testid={`team-user-${p.id}`} className="p-4 border-white/5 bg-white/5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center",
                      p.role === 'super_admin' ? "bg-accent-orange/20 text-accent-orange border border-accent-orange/30" :
                      p.role === 'admin' ? "bg-primary/10 text-primary border border-primary/20" :
                      "bg-white/10 text-muted-foreground"
                    )}>
                      {p.role === 'super_admin' ? <Sparkles size={20} /> :
                       p.role === 'admin' ? <ShieldCheck size={20} /> :
                       <Users size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm uppercase leading-tight">{p.full_name || `Utente ${p.id.slice(0, 5)}`}</p>
                      <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest leading-none mt-1">
                        {p.role === 'super_admin' ? 'Super Admin' : p.role === 'admin' ? 'Titolare (Admin)' : 'Staff'} &bull; {formatDateTime(p.updated_at)}
                      </p>
                    </div>
                  </div>
                  {((role === 'super_admin' && p.id !== useAuthStore.getState().user?.id) ||
                    (role === 'admin' && p.role === 'staff')) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-accent-red h-9 w-9"
                      onClick={() => handleDeleteProfile(p.id, p.role)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Permessi Ordini</h4>
                      <p className="text-[9px] text-muted-foreground mt-1">Configurazione isolata per il locale selezionato</p>
                    </div>
                    {permissionStatus === 'saved' && (
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase text-accent-green">
                        <CheckCircle2 size={12} /> Salvato
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {permissionFields.map((field) => (
                      <label key={field.key} className="flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-black/20 cursor-pointer">
                        <input
                          type="checkbox"
                          data-permission={field.key}
                          className="mt-0.5 accent-orange-500"
                          checked={permission[field.key]}
                          onChange={(event) => updatePermission(p.id, field.key, event.target.checked)}
                        />
                        <span>
                          <span className="block text-xs font-bold text-white">{field.label}</span>
                          <span className="block text-[9px] text-muted-foreground mt-0.5">{field.note}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {permissionStatus === 'error' && (
                    <p className="text-xs text-accent-red" role="alert">Salvataggio non autorizzato o non riuscito.</p>
                  )}
                  <Button
                    data-testid={`save-order-permissions-${p.id}`}
                    variant="secondary"
                    className="w-full gap-2 text-[10px] font-black uppercase tracking-widest"
                    disabled={permissionStatus === 'saving'}
                    onClick={() => void saveOrderPermissions(p.id)}
                  >
                    <Save size={14} /> {permissionStatus === 'saving' ? 'Salvataggio…' : 'Salva permessi Ordini'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
