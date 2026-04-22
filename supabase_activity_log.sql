-- 1. Tabella Log Attività
CREATE TABLE IF NOT EXISTS public.activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action_type TEXT NOT NULL, -- 'event_close', 'restock_close'
    action_id UUID NOT NULL,   -- ID dell'evento o della sessione di carico
    details JSONB,             -- Snapshot dei dati modificati
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_undone BOOLEAN DEFAULT FALSE
);

-- 2. RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolamento Log per Locale" ON public.activity_log
    FOR ALL USING (
        venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 3. Indice per velocità
CREATE INDEX idx_activity_log_venue ON public.activity_log(venue_id);
