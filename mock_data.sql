-- LIQUIDSTOCK MANAGER: MOCK DATA SQL
-- Copia e incolla questo script nell'SQL Editor per inserire dei dati di prova

INSERT INTO public.products (name, category, unit, cost_price, selling_price, current_stock, min_threshold, is_active)
VALUES
('Belvedere Vodka 0.7L', 'Spirits', 'bottle', 35.00, 150.00, 42.00, 10.00, true),
('Grey Goose 0.7L', 'Spirits', 'bottle', 32.00, 140.00, 24.00, 10.00, true),
('Gin Bombay Sapphire', 'Spirits', 'bottle', 18.00, 100.00, 15.00, 5.00, true),
('Champagne Moët & Chandon', 'Wine', 'bottle', 40.00, 160.00, 18.00, 6.00, true),
('Red Bull (Cassa 24)', 'Mixer', 'case', 24.00, 120.00, 12.00, 3.00, true),
('Coca Cola 1L', 'Mixer', 'bottle', 1.20, 10.00, 48.00, 20.00, true),
('Prosecco Valdo', 'Wine', 'bottle', 6.50, 45.00, 60.00, 12.00, true),
('Corona Extra', 'Beer', 'bottle', 1.10, 6.00, 120.00, 48.00, true),
('Tonic Water Schweppes', 'Mixer', 'bottle', 1.00, 8.00, 50.00, 24.00, true),
('Campari Bitter 1L', 'Spirits', 'bottle', 15.00, 90.00, 8.00, 3.00, true);
