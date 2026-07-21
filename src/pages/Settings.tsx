import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Users, Key, Trash2, ShieldCheck, Sparkles } from "lucide-react";
import { formatDateTime } from "../lib/formatters";
import { createStaffInvite } from "../lib/registrationInvites";

interface TeamProfile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'staff' | 'super_admin' | 'osservatore';
  updated_at: string | null;
}

export default function Settings() {
  const { role, venueId } = useAuthStore();
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [validatedVenueId, setValidatedVenueId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setProfiles([]);
    setValidatedVenueId(null);
    setLoadError(null);

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
      setProfiles((profileRows || []) as TeamProfile[]);
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
          {profiles.map(p => (
            <Card key={p.id} className="p-4 flex items-center justify-between border-white/5 bg-white/5">
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
              
              {/* Mostra il cestino se: 
                  1. Sono Super Admin e non sto eliminando me stesso
                  2. Sono Admin e sto eliminando uno Staff
              */}
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
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}


function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
