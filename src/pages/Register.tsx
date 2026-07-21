import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { UserPlus, AlertCircle, ArrowLeft } from "lucide-react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";

export default function Register() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  
  const { registerWithInvite, isLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => setErrorMsg(""), [inviteToken]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsValidating(true);

    if (!inviteToken) {
      setErrorMsg("Link di iscrizione non valido. Usa il link fornito dal titolare.");
      setIsValidating(false);
      return;
    }

    if (!fullName || fullName.length < 3) {
      setErrorMsg("Inserisci il tuo nome e cognome completi.");
      setIsValidating(false);
      return;
    }

    try {
      const { error } = await registerWithInvite(inviteToken, email, password, fullName);
      if (error) {
        setErrorMsg("Errore registrazione: " + (error.message || "Riprova."));
      } else {
        alert("✅ Registrazione staff completata. Ora puoi accedere.");
        navigate("/login");
      }
    } catch (err) {
      setErrorMsg("Errore imprevisto. Riprova più tardi.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0a0a]">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/5"></div>
      
      <div className="w-full max-w-sm space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <Link to="/login" className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-white transition-colors mb-4">
            <ArrowLeft size={12} className="mr-1" /> Torna al Login
          </Link>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4 border border-primary/20">
            <UserPlus size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic leading-tight">
            Registrazione
          </h1>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
            Invito staff monouso
          </p>
        </div>

        <Card className="p-6 border-muted/20 bg-card/40 backdrop-blur-md">
          {!inviteToken ? (
            <div className="text-center py-4 space-y-4">
              <AlertCircle size={40} className="mx-auto text-accent-red opacity-50" />
              <p className="text-sm text-muted-foreground">Link non valido. Contatta il titolare del locale per farti mandare l'invito segreto.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                Torna indietro
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome e Cognome</label>
                <Input 
                  type="text"
                  placeholder="MARIO ROSSI"
                  className="h-12 bg-black/40 border-muted/20 text-white uppercase"
                  value={fullName}
                  onChange={e => setFullName(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email personale</label>
                <Input 
                  type="email"
                  placeholder="nome@gmail.com"
                  className="h-12 bg-black/40 border-muted/20 text-white"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Password</label>
                <Input 
                  type="password"
                  placeholder="••••••••"
                  className="h-12 bg-black/40 border-muted/20 text-white"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-center gap-2 text-xs text-accent-red">
                  <AlertCircle size={14} />
                  {errorMsg}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 text-sm font-bold uppercase tracking-tight shadow-lg shadow-primary/20"
                disabled={isLoading || isValidating}
              >
                {isLoading || isValidating ? "Verifica in corso..." : "Crea account staff"}
              </Button>
            </form>
          )}
        </Card>

        <p className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-[0.1em]">
          {inviteToken ? "Il token scade e viene invalidato dopo il primo utilizzo." : "Contatta il supporto se riscontri problemi."}
        </p>
      </div>
    </div>
  );
}
