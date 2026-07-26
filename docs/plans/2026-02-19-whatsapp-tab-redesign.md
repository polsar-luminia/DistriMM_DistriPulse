# WhatsApp Tab Redesign

**Date**: 2026-02-19
**Status**: Approved

## Context

DistriMM migrated from Evolution API to Meta Cloud API + Chatwoot. The existing `WhatsAppTab` component in `MessagesPage.jsx` (~340 lines) implements QR scanning, instance management, and polling — all Evolution-specific logic that must be removed.

## Goal

Replace the WhatsApp tab with a simple status panel that shows:
1. WABA account configuration status (static env var check)
2. Messaging statistics (today / last 7 days)
3. A link to open Chatwoot in a new tab

## Design

### Layout

Three sections stacked vertically:

1. **WABA Status Card**: Green badge "Configurado" if `VITE_META_PHONE_NUMBER_ID` is set, orange "No configurado" if missing. Shows the phone number ID alongside the status.

2. **Stats Cards** (side by side): "Enviados hoy" and "Enviados esta semana" — counts from `distrimm_mensajes_log` where `estado = 'enviado'`.

3. **Chatwoot Card**: Button "Abrir Chatwoot" → `window.open(VITE_CHATWOOT_URL, '_blank')`. Disabled with tooltip if `VITE_CHATWOOT_URL` is not set.

### State

```js
const [stats, setStats] = useState({ today: 0, week: 0, loading: true });
const isConfigured = Boolean(import.meta.env.VITE_META_PHONE_NUMBER_ID);
const chatwootUrl = import.meta.env.VITE_CHATWOOT_URL;
```

### Data Fetching

Single `useEffect` on mount — two Supabase `count` queries (head: true) against `distrimm_mensajes_log`:
- `created_at >= today 00:00:00` + `estado = 'enviado'`
- `created_at >= 7 days ago` + `estado = 'enviado'`

### Removed

- All state: `waStatus`, `qrCode`, `phoneNumber`, `instanceName`, `actionLoading`, polling refs
- All functions: `handleConnect`, `handleDisconnect`, `handleCancel`, `startPolling`, `stopPolling`, `checkStatus`
- Imports: `connectWhatsApp`, `getWhatsAppStatus`, `disconnectWhatsApp` from `whatsappInstanceService`

## Approach

Inline replacement inside `MessagesPage.jsx` (no new files). Consistent with how `NuevoLoteTab` and `PlantillasTab` are structured. Net reduction of ~220 lines.

## Files Changed

| File | Action |
|------|--------|
| `src/pages/MessagesPage.jsx` | Replace `WhatsAppTab` component (~lines 1508–1848) |
