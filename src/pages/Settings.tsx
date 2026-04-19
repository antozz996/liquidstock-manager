import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Users, Key, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { formatDateTime } from "../lib/formatters";

export default function Settings() {
  const { role } = useAuthStore();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [regCode, setRegCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    // 1. Fetch Profiles
    const { data: pData } = await supabase
      .from('profiles')
      .select('*')
      .order('role', { ascending: true });
    if (pData) setProfiles(pData);

    // 2. Fetch Registration Code
    const { data: cData } = await supabase
      .from('configs')
      .select('value')
      .eq('key', 'registration_code')
      .single();
    if (cData) setRegCode(cData.value);
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateCode = async () => {
    if (!newCode || newCode.length < 4) {
      alert("Il codice deve essere di almeno 4 caratteri.");
      return;
    }
    const { error } = await supabase
      .from('configs')
      .update({ value: newCode })
      .eq('key', 'registration_code');
    
    if (!error) {
      setRegCode(newCode);
      setNewCode("");
      alert("✅ Codice di registrazione aggiornato correttamente!");
    }
  };

  const handleDeleteProfile = async (id: string, pRole: string) => {
    if (pRole === 'admin') {
      alert("Non puoi eliminare un amministratore.");
      return;
    }
    if (!confirm("Sei sicuro di voler eliminare questo profilo? L'utente non potrà più accedere.")) return;
    
    // Rimuoviamo il profilo (per eliminare l'utente auth servirebbe l'admin API, 
    // ma cancellando il profilo non avrà più il ruolo staff e sarà bloccato dalle policy)
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (!error) fetchData();
  };

  if (role !== 'admin') {
    return <div className="pt-20 text-center text-muted-foreground">Accesso riservato agli amministratori.</div>;
  }

  return (
    <div className="space-y-6 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Users className="text-primary w-5 h-5" />
        <h1 className="text-2xl font-bold tracking-tight">Gestione Team</h1>
      </div>

      {/* Configurazione Codice */}
      <Card className="p-5 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Key size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white">Codice Registrazione</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usato dallo Staff per registrarsi</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div className="flex gap-2">
            <div className="flex-1 bg-black/40 rounded-lg border border-muted/20 px-4 flex items-center h-12">
              <span className="text-xl font-mono font-black tracking-widest text-primary italic">{regCode}</span>
            </div>
            <Button variant="outline" size="icon" className="h-12 w-12" onClick={fetchData}>
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
          
          <Button 
            variant="secondary" 
            className="w-full text-[10px] font-bold uppercase tracking-widest h-9 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            onClick={() => {
              const link = `${window.location.origin}/register`;
              navigator.clipboard.writeText(`Ciao! Registrati su LiquidStock usando questo link: ${link} e il codice segreto: ${regCode}`);
              alert("✅ Link e codice copiati! Ora puoi incollarli su WhatsApp.");
            }}
          >
            Copia Link e Messaggio Invito
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Cambia Codice</label>
          <div className="flex gap-2">
            <Input 
              placeholder="Nuovo Codice..." 
              className="h-10 flex-1"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase())}
            />
            <Button size="sm" onClick={handleUpdateCode}>Aggiorna</Button>
          </div>
        </div>
      </Card>

      {/* Lista Profili */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Utenti Registrati</h3>
        <div className="space-y-3">
          {profiles.map(p => (
            <Card key={p.id} className="p-4 flex items-center justify-between border-muted/20 bg-card/40">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center",
                  p.role === 'admin' ? "bg-accent-orange/10 text-accent-orange" : "bg-muted/10 text-muted-foreground"
                )}>
                  {p.role === 'admin' ? <ShieldCheck size={20} /> : <Users size={20} />}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">Utente {p.id.slice(0, 5)}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase">{p.role} &bull; Attivo dal {formatDateTime(p.updated_at)}</p>
                </div>
              </div>
              
              {p.role !== 'admin' && (
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

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
