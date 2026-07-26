---
name: senior-dev-distri
description: >
  Patrones específicos de los proyectos de distribución (DistriMM, DistriPolsar, Demo).
  Complementa senior-dev con: Supabase avanzado (RLS, Edge Functions, RPC), flujo de carga
  Excel (ETL con batch insert y rollback), integraciones n8n/webhooks (proxy, polling, timeout),
  y formato COP colombiano. Activar junto con senior-dev en cualquier tarea de estos proyectos.
  NO aplica a proyectos fuera del dominio de distribución.
---

# Patrones Específicos — Distribuidoras

Estos patrones aplican a DistriMM, DistriPolsar y Demo. Son Encoded Preferences del negocio de distribución — no se vuelven obsoletos cuando el modelo mejora.

---

## 15. Supabase: Patrones del Proyecto

**Client singleton.** Un solo `createClient` en `src/lib/supabase.js` con validación de env vars:
```js
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.DEV) console.warn("Supabase URL or Key missing. Check .env");
}
export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder");
```

**Paginación >1000 filas.** Supabase limita a 1000 rows por defecto. Usar helper `fetchAllRows`:
```js
export async function fetchAllRows(queryBuilder, pageSize = 1000) {
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}
```

**RLS (Row Level Security).** Siempre activo. Tres niveles:
```sql
-- Básico: solo usuarios autenticados
CREATE POLICY "tabla_select_auth" ON public.tabla FOR SELECT USING (auth.uid() IS NOT NULL);

-- Role-based: admin/manager con lookup a profiles
CREATE POLICY "audit_select_admin" ON public.audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol IN ('admin', 'manager'))
);

-- SECURITY DEFINER para operaciones que necesitan bypass controlado (con audit trail)
CREATE OR REPLACE FUNCTION public.fn_delete_carga(p_carga_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  INSERT INTO public.audit_log (user_id, action, target_table, target_id)
  VALUES (auth.uid(), 'DELETE_CARGA', 'historial_cargas', p_carga_id);
  DELETE FROM public.historial_cargas WHERE id = p_carga_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_delete_carga(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_delete_carga(UUID) FROM anon;
```

**Edge Functions.** Patrón dual-client: anon para verificar identidad del caller, service_role para operaciones admin:
```ts
// Verificar caller con su token
const supabaseUser = createClient(url, anonKey, {
  global: { headers: { Authorization: req.headers.get("Authorization")! } },
});
const { data: { user } } = await supabaseUser.auth.getUser();

// Operaciones privilegiadas con service_role
const supabaseAdmin = createClient(url, serviceRoleKey);
const { data } = await supabaseAdmin.from("credentials").select("*").eq("id", user.id).single();
```

**RPC y Edge Function invoke** desde el frontend:
```js
// RPC — para queries/mutations encapsuladas en funciones SQL
const { data, error } = await supabase.rpc("fn_cfo_historico_cartera");

// Edge Function invoke — para lógica server-side con secretos
const { data, error } = await supabase.functions.invoke("proxy-n8n-cfo", { body: payload });
```

---

## 16. Flujo de Carga Excel (ETL)

Patrón estándar para importación de datos desde Excel:

```
FileReader.readAsArrayBuffer(file)
→ XLSX.read(data, { type: "array" })
→ XLSX.utils.sheet_to_json(ws, { range: 1 })  // probar range 0 si sale vacío
→ Transformar: mapear columnas por índice, limpiar, validar
→ Batch insert a Supabase (100-200 filas por batch)
```

**Parsing de fechas Excel.** Los archivos Excel pueden traer fechas como números seriales o strings:
```js
function parseExcelDate(raw) {
  if (!raw) return null;
  if (typeof raw === "number") {
    // Serial date de Excel (días desde 1899-12-30)
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + raw);
    return d.toISOString().split("T")[0];
  }
  const s = String(raw).trim();
  const parts = s.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
```

**Patrón carga + detalles** con rollback:
```js
// 1. Crear registro de carga (parent)
const { data: carga } = await supabase
  .from("historial_cargas")
  .insert({ nombre_archivo: file.name, total_registros: rows.length })
  .select().single();
const createdId = carga.id;

// 2. Batch insert detalles (children)
const batchSize = 100;
for (let i = 0; i < rows.length; i += batchSize) {
  const batch = rows.slice(i, i + batchSize).map(r => ({ ...r, carga_id: createdId }));
  const { error } = await supabase.from("detalles").insert(batch);
  if (error) {
    // 3. Rollback — borrar carga huérfana si falla el insert de detalles
    await supabase.from("historial_cargas").delete().eq("id", createdId);
    throw error;
  }
  setProgress(30 + Math.round(((i + batch.length) / rows.length) * 70));
}
```

**Transformación con column index.** Los Excel del negocio no tienen headers estándar — mapear por posición:
```js
const processed = jsonData.map(row => {
  const keys = Object.keys(row);
  const get = (idx) => row[keys[idx]];
  const num = (idx) => parseFloat(get(idx)) || 0;
  return {
    vendedor_codigo: String(get(1) || "").trim(),
    cliente_nit: String(get(7) || "").trim(),
    valor_recaudo: num(15),
    dias_mora: parseInt(get(16), 10) || 0,
  };
}).filter(r => r.vendedor_codigo && r.valor_recaudo !== 0);
```

---

## 17. Integraciones n8n / Webhooks

Tres patrones según el caso de uso:

**Pattern 1: Edge Function proxy** (preferido — credenciales server-side):
```js
// Frontend — solo invoca, nunca ve las credenciales de n8n/WhatsApp
const { data, error } = await supabase.functions.invoke("proxy-n8n-whatsapp", {
  body: { lote_id: loteId, instance_id: instanceId },
});
// Edge Function busca credenciales en tabla admin (bypasa RLS con service_role),
// las inyecta al payload y reenvía a n8n. El frontend nunca ve tokens.
```

**Pattern 2: Llamada directa a n8n** (solo para operaciones read-only que exceden 60s):
```js
// NOTA: Llamada directa porque el AI Agent puede tardar 40-70s,
// excediendo el límite de 60s de Edge Functions en plan Free.
// Solo lectura (consulta datos), no modifica nada.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 90_000);
try {
  const res = await fetch(N8N_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authKey ? { "x-n8n-auth": authKey } : {}) },
    body: JSON.stringify({ sessionId, chatInput: message }),
    signal: controller.signal,
  });
  return { data: await res.json(), error: null };
} catch (err) {
  return { data: null, error: err.name === "AbortError" ? "Timeout: 90s" : err.message };
} finally { clearTimeout(timeout); }
```

**Pattern 3: Polling para procesamiento async** (lotes de WhatsApp, jobs largos):
```js
const pollingRef = useRef(null);
const pollingInFlightRef = useRef(false); // Guard contra requests apilados

const startPolling = (loteId) => {
  const poll = async () => {
    if (pollingInFlightRef.current) return;
    pollingInFlightRef.current = true;
    try {
      const { data } = await getLoteById(loteId);
      if (data) {
        setActiveLote(data);
        if (data.estado !== "pendiente" && data.estado !== "en_proceso") {
          clearInterval(pollingRef.current); // Auto-stop cuando termina
        }
      }
    } finally { pollingInFlightRef.current = false; }
  };
  poll(); // Ejecutar inmediatamente
  pollingRef.current = setInterval(poll, 10_000); // Luego cada 10s
};

// Cleanup obligatorio
useEffect(() => () => clearInterval(pollingRef.current), []);
```

---

## 18. Formato COP y Locale Colombiano

**Moneda COP** — usar siempre `Intl.NumberFormat` con locale `es-CO`, sin decimales:
```js
export const formatCurrency = (value) => {
  if (value === undefined || value === null || isNaN(value)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
};
```

**Fechas con timezone safety.** Colombia es UTC-5. Para evitar que `new Date("2024-01-15")` muestre el día anterior:
```js
// Forzar mediodía para evitar day-shift por timezone
const safeDate = new Date(`${dateString}T12:00:00`);
return new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
}).format(safeDate);
```

**Números grandes** con separadores de miles colombianos (punto):
```js
new Intl.NumberFormat("es-CO").format(1234567); // "1.234.567"
```

**Regla:** siempre manejar `null`/`undefined` con fallback seguro (`"$0"`, `"N/A"`, `"0%"`). Nunca dejar que `undefined` llegue a `Intl.NumberFormat`.
