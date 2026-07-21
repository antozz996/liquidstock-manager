import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SurgicalSetup() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0a0a]">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5"></div>
      
      <div className="w-full max-w-sm space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-accent-orange/10 rounded-full flex items-center justify-center text-accent-orange mb-4 border border-accent-orange/20">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">Surgical Setup</h1>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">Bootstrap disabilitato dal browser</p>
        </div>

        <Card className="p-6 border-muted/20 bg-card/40 backdrop-blur-md shadow-2xl">
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            La creazione del primo amministratore è un’operazione server-side. Questa pagina non accetta più ruolo, venue o credenziali di bootstrap dal browser.
          </p>
          <Button className="w-full" onClick={() => navigate('/login')}>Torna al login</Button>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground font-medium uppercase leading-relaxed px-4">
          Una volta registrato l'admin tramite questa pagina, potrai accedere normalmente dal login.
        </p>
      </div>
    </div>
  );
}
