import React, { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { UserPlus, Key, AlertCircle, ArrowLeft } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  
  const { signUp, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsValidating(true);

    try {
      // 1. Verifica codice segreto
      const { data, error: codeError } = await supabase
        .from('configs')
        .select('value')
        .eq('key', 'registration_code')
        .single();

      if (codeError || data.value !== secretCode.trim()) {
        setErrorMsg("Codice segreto non valido. Contatta l'amministratore.");
        setIsValidating(false);
        return;
      }

      // 2. Procede con registrazione staff
      if (password.length < 6) {
        setErrorMsg("La password deve essere di almeno 6 caratteri.");
        setIsValidating(false);
        return;
      }

      const { error } = await signUp(email, password, 'staff');
      if (error) {
        setErrorMsg("Errore registrazione: " + (error.message || "Riprova."));
      } else {
        alert("✅ Registrazione completata! Benvenuto nel Team.");
        navigate("/");
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
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">Registrazione Staff</h1>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">Entra nel Team LiquidStock</p>
        </div>

        <Card className="p-6 border-muted/20 bg-card/40 backdrop-blur-md">
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Personale</label>
              <Input 
                type="email"
                placeholder="nome@gmail.com"
                className="h-12 bg-black/40 border-muted/20"
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
                className="h-12 bg-black/40 border-muted/20"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Codice Segreto Invito</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                <Input 
                  type="text"
                  placeholder="Inserisci il codice ricevuto"
                  className="pl-10 h-12 bg-primary/5 border-primary/20 focus:border-primary/50 text-primary font-mono uppercase tracking-[0.2em]"
                  value={secretCode}
                  onChange={e => setSecretCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
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
              {isLoading || isValidating ? "Verifica in corso..." : "Crea Account Staff"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-[0.1em]">
          Contatta il titolare se non possiedi un codice valido.
        </p>
      </div>
    </div>
  );
}
