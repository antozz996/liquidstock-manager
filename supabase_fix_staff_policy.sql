-- ============================================================
-- FIX POLICY PRODOTTI PER STAFF E OSSERVATORE
-- ============================================================
-- Lo staff deve poter modificare i prodotti per aggiornare le giacenze 
-- durante la chiusura delle serate e il carico merci.

DROP POLICY IF EXISTS "Modifica Prodotti per Locale" ON public.products;
CREATE POLICY "Modifica Prodotti per Locale" ON public.products
    FOR ALL USING (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin', 'staff')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    )
    WITH CHECK (
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin', 'staff')) AND
        (venue_id = (SELECT venue_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin')
    );

-- Nota: Il ruolo 'osservatore' NON è incluso, quindi rimane in sola lettura.
-- Il ruolo 'staff' ora può aggiornare le giacenze correttamente.
