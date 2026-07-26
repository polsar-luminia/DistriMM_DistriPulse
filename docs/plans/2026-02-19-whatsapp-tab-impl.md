# WhatsApp Tab Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the QR/Evolution-based WhatsAppTab in MessagesPage.jsx with a static WABA status panel + messaging stats + Chatwoot link.

**Architecture:** Inline replacement inside `MessagesPage.jsx` (no new files). Static env-var check for WABA status. Two Supabase `count` queries for daily/weekly stats. Chatwoot opened in new tab via `window.open`.

**Tech Stack:** React 19, Supabase JS v2, Lucide React, Tailwind CSS 4, sileo toasts.

---

### Task 1: Update imports in MessagesPage.jsx

**Files:**
- Modify: `src/pages/MessagesPage.jsx:1-55`

**Step 1: Check which icons are used outside the WhatsApp tab**

Search for each of the following in lines 1–1500 (before the WhatsApp tab):

```
QrCode     → Only in WhatsApp tab → REMOVE
WifiOff    → Only in WhatsApp tab → REMOVE
Wifi       → Only in WhatsApp tab → REMOVE
Unplug     → Only in WhatsApp tab → REMOVE
PhoneOff   → Only in WhatsApp tab → REMOVE
Phone      → Only in WhatsApp tab → REMOVE
```

Also verify `AlertCircle` is used elsewhere (it is — keep it).

**Step 2: Replace the Lucide import block (lines 10–43)**

Remove these icons from the import: `Phone`, `PhoneOff`, `QrCode`, `Unplug`, `Wifi`, `WifiOff`

Add this icon: `ExternalLink`

The final import block should be:

```js
import {
  Search,
  Filter,
  Send,
  CheckCircle,
  Clock,
  History,
  MessageCircle,
  Users,
  FileText,
  Eye,
  X,
  AlertTriangle,
  Loader,
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  Trash2,
  RefreshCw,
  Package,
  RotateCcw,
  Ban,
  ArrowLeft,
  Zap,
  AlertCircle,
  Smartphone,
  ExternalLink,
} from "lucide-react";
```

**Step 3: Add supabase import after line 50 (`import { useAuth } ...`)**

```js
import { supabase } from "../lib/supabase";
```

**Step 4: Remove the whatsappInstanceService import (lines 51–55)**

Delete these lines entirely:
```js
import {
  connectWhatsApp,
  getWhatsAppStatus,
  disconnectWhatsApp,
} from "../services/whatsappInstanceService";
```

---

### Task 2: Replace the WhatsAppTab component

**Files:**
- Modify: `src/pages/MessagesPage.jsx:1501-1848`

**Step 1: Delete the old component**

Remove everything from line 1501 to line 1848 inclusive:
```
// ════ WHATSAPP TAB (Instance management) ════
const QR_POLL_INTERVAL = 5000;
const QR_EXPIRY_MS = 55000;
function WhatsAppTab() { ... }
```

**Step 2: Insert the new component in its place**

```jsx
// ════════════════════════════════════════════════════════════════════════════
// WHATSAPP TAB (Meta Cloud API + Chatwoot)
// ════════════════════════════════════════════════════════════════════════════

function WhatsAppTab() {
  const [stats, setStats] = useState({ today: 0, week: 0, loading: true });

  const isConfigured = Boolean(import.meta.env.VITE_META_PHONE_NUMBER_ID);
  const phoneNumberId = import.meta.env.VITE_META_PHONE_NUMBER_ID || "—";
  const chatwootUrl = import.meta.env.VITE_CHATWOOT_URL;

  useEffect(() => {
    async function loadStats() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      const [{ count: todayCount }, { count: weekCount }] = await Promise.all([
        supabase
          .from("distrimm_mensajes_log")
          .select("*", { count: "exact", head: true })
          .eq("estado", "enviado")
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("distrimm_mensajes_log")
          .select("*", { count: "exact", head: true })
          .eq("estado", "enviado")
          .gte("created_at", weekStart.toISOString()),
      ]);

      setStats({ today: todayCount ?? 0, week: weekCount ?? 0, loading: false });
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Estado WABA */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isConfigured ? "bg-emerald-50" : "bg-amber-50"}`}>
              <Smartphone size={24} className={isConfigured ? "text-emerald-600" : "text-amber-500"} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">WhatsApp Business</p>
              <p className="text-sm font-black text-slate-800">Meta Cloud API</p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              isConfigured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isConfigured ? "Configurado" : "No configurado"}
          </span>
        </div>

        {isConfigured && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Phone Number ID</span>
              <span className="font-mono font-bold text-slate-700 text-xs">{phoneNumberId}</span>
            </div>
          </div>
        )}

        {!isConfigured && (
          <p className="mt-3 text-xs text-amber-600">
            Configura{" "}
            <code className="bg-amber-50 px-1 rounded font-mono">VITE_META_PHONE_NUMBER_ID</code>{" "}
            en el archivo .env para activar el envio de mensajes.
          </p>
        )}
      </Card>

      {/* Estadisticas */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Enviados hoy</p>
          {stats.loading ? (
            <Loader size={20} className="animate-spin text-slate-300 mx-auto" />
          ) : (
            <p className="text-3xl font-black text-slate-800">
              {stats.today.toLocaleString("es-CO")}
            </p>
          )}
        </Card>
        <Card className="p-5 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Enviados esta semana</p>
          {stats.loading ? (
            <Loader size={20} className="animate-spin text-slate-300 mx-auto" />
          ) : (
            <p className="text-3xl font-black text-slate-800">
              {stats.week.toLocaleString("es-CO")}
            </p>
          )}
        </Card>
      </div>

      {/* Chatwoot */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-slate-800">Chatwoot</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestiona conversaciones entrantes de WhatsApp
            </p>
          </div>
          <button
            onClick={() =>
              chatwootUrl && window.open(chatwootUrl, "_blank", "noopener,noreferrer")
            }
            disabled={!chatwootUrl}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              !chatwootUrl
                ? "URL de Chatwoot no configurada (VITE_CHATWOOT_URL)"
                : undefined
            }
          >
            <ExternalLink size={14} />
            Abrir Chatwoot
          </button>
        </div>
      </Card>
    </div>
  );
}
```

---

### Task 3: Verify

**Step 1: Check for lint errors**

Run: `npm run lint`
Expected: no errors related to unused imports or undefined variables.

**Step 2: Start dev server and verify visually**

Run: `npm run dev`

Navigate to `/mensajes` → tab "WhatsApp":
- [ ] Tab renders without crash
- [ ] WABA status card shows green "Configurado" badge (if `VITE_META_PHONE_NUMBER_ID` is set in .env) or amber "No configurado"
- [ ] Stats cards show numbers (or 0) — not stuck in loading after ~2s
- [ ] "Abrir Chatwoot" button is enabled if `VITE_CHATWOOT_URL` is set, disabled otherwise
- [ ] No console errors

**Step 3: Verify .env has the needed vars**

Check `.env` has:
```
VITE_META_PHONE_NUMBER_ID=<real value>
VITE_CHATWOOT_URL=https://chat.tudominio.com
```

If not yet configured, the tab should gracefully show "No configurado" and a disabled Chatwoot button — that's correct behavior.
