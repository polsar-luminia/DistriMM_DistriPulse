-- Add Indexes for Performance Optimization

-- Index for filtering by days overdue (heavily used in dashboard)
CREATE INDEX IF NOT EXISTS idx_distrimm_cartera_items_dias_mora ON public.distrimm_cartera_items(dias_mora);

-- Index for sorting by balance (Top Clients)
CREATE INDEX IF NOT EXISTS idx_distrimm_cartera_items_valor_saldo ON public.distrimm_cartera_items(valor_saldo);

-- Index for upcoming expirations (days_until_due is calculated, but filtering uses dias_mora <= 0 and fecha_vencimiento)
CREATE INDEX IF NOT EXISTS idx_distrimm_cartera_items_fecha_vencimiento ON public.distrimm_cartera_items(fecha_vencimiento);
