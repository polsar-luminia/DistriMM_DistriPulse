-- Reiniciar el caché del flujo CFO
-- Esto establecerá el último análisis a NULL, forzando a n8n a procesar la carga más reciente nuevamente.
UPDATE public.insights_cache
SET 
  last_analyzed_load_id = NULL,
  analysis_json = NULL
WHERE id = 1;

-- Verificación opcional
SELECT * FROM public.insights_cache WHERE id = 1;
