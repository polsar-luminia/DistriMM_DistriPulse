# Checklist: Retiro definitivo de n8n

Ejecutar DESPUÉS de verificar que las nuevas Edge Functions funcionan en producción.

## Paso 1 — Verificar Edge Function CFO

Hacer clic en "Generar análisis" en la página CFO Analysis del frontend.

Confirmar en Supabase:
```sql
SELECT carga_id, status, updated_at,
       dashboard->'health_score',
       dashboard->'semaforo_general'
FROM distrimm_cfo_analyses
ORDER BY updated_at DESC LIMIT 3;
```

Esperado: fila nueva con `status = 'ready'` y `health_score` numérico.

## Paso 2 — Verificar Edge Function Chatbot

Abrir la página DistriBot y probar estas 3 preguntas:

1. "¿Cuál es la cartera total actual?" → debe retornar cifra exacta en COP
2. "Top 10 clientes morosos con sus montos" → debe incluir bloque ` ```chart `
3. "Evolución de mora en los últimos 3 meses" → debe consultar `distrimm_cartera_historico`

Confirmar en logs de Edge Functions:
```bash
npx supabase functions logs proxy-n8n-chatbot --project-ref xzhqhmjfhnvqxndxayxs
```

## Paso 3 — Desactivar workflows en n8n (no borrar aún)

Acceder a https://n8n-n8n.mwfwdg.easypanel.host y desactivar (toggle OFF):

- [ ] `nRnNxKPGcCeHzWCy` — DistriMM WhatsApp Mensajes
- [ ] `2HcZs2TTuqIwRP1e` — DistriBot CFO Chat Cartera
- [ ] `5mCEZIKSECOF4qoT` — DistriMM CFO Analyst

## Paso 4 — Borrar secrets obsoletos de Supabase

Dashboard → Edge Functions → Secrets → Borrar:

- [ ] `N8N_WEBHOOK_URL`
- [ ] `N8N_CHAT_URL`
- [ ] `N8N_AUTH_KEY`
- [ ] `N8N_WHATSAPP_URL` (ya estaba muerto)

> Asegurarse de que `OPENAI_API_KEY` está configurada ANTES de hacer esto.

## Paso 5 — Después de 7 días sin incidencias

- [ ] Borrar los 3 workflows de n8n
- [ ] Evaluar si queda algún workflow activo; si no, apagar la instancia de n8n en Easypanel (`n8n-n8n.mwfwdg.easypanel.host`)
- [ ] Actualizar CLAUDE.md: eliminar sección "n8n Workflows", tabla de workflows activos, bloque "n8n Code Node Constraints" y secrets `N8N_*`
