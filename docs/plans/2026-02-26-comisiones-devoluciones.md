# Comisiones — Soporte de Devoluciones (DV)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reconocer la columna 29 "Tipo" (VE/DV) del Excel de ventas, invertir el signo de los montos en devoluciones, almacenar el tipo en Supabase, y ajustar la RPC para que el campo comisionable use `costo` (así las DV restan automáticamente).

**Architecture:** 3 capas independientes — SQL primero (tabla + RPC), luego JS parsing, luego UI preview. No hay cambios en servicios ni hooks. La inversión de signo ocurre en el ETL del modal, no en la RPC.

**Tech Stack:** React 19, Vite 7, Supabase JS client, PostgreSQL RPC, sileo para toasts.

---

## Task 1: SQL — Agregar columna `tipo` a `distrimm_comisiones_ventas`

**Files:**
- Create: `tipo_dv_migration.sql` (en la raíz del proyecto)

**Contexto:** La tabla `distrimm_comisiones_ventas` no tiene columna `tipo`. La migración la agrega con default `'VE'` para no romper filas existentes.

**Step 1: Crear el archivo de migración**

Crear `tipo_dv_migration.sql` en la raíz del proyecto con exactamente este contenido:

```sql
-- DistriMM: Soporte devoluciones (DV) en comisiones_ventas
-- Run in Supabase SQL editor: Dashboard → SQL Editor → New query

-- 1. Agregar columna tipo a ventas
ALTER TABLE distrimm_comisiones_ventas
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'VE';

-- 2. Comentario de documentación
COMMENT ON COLUMN distrimm_comisiones_ventas.tipo
  IS 'Tipo de movimiento: VE=Venta, DV=Devolución. Los montos de DV ya vienen con signo negativo desde el ETL.';
```

**Step 2: Ejecutar en Supabase**

Ir a: Dashboard → SQL Editor → New query → pegar el contenido → Run.

Verificar que no hay error. Si la columna ya existe, `IF NOT EXISTS` evita el error.

**Step 3: Verificar**

Ejecutar en el SQL editor:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'distrimm_comisiones_ventas'
  AND column_name = 'tipo';
```
Esperado: una fila con `tipo | text | 'VE'::text`.

---

## Task 2: SQL — Actualizar RPC `fn_calcular_comisiones`

**Files:**
- Create: `rpc_dv_migration.sql` (en la raíz del proyecto)

**Contexto:** El campo `ventas_comisionables` actualmente suma `valor_total`. Debe sumar `costo` para que las DV (con costo negativo) descuenten automáticamente sin lógica extra. `margen_comisionable` = `valor_total - costo` sigue igual (DV tienen ambos negativos, el margen neto es correcto).

**Step 1: Crear el archivo**

Crear `rpc_dv_migration.sql` en la raíz del proyecto:

```sql
-- DistriMM: Actualizar fn_calcular_comisiones — base comisionable = costo
-- Run in Supabase SQL editor

CREATE OR REPLACE FUNCTION fn_calcular_comisiones(p_carga_id UUID)
RETURNS TABLE (
  vendedor_codigo TEXT,
  vendedor_nombre TEXT,
  total_ventas NUMERIC,
  total_costo NUMERIC,
  ventas_excluidas NUMERIC,
  ventas_comisionables NUMERIC,
  costo_comisionable NUMERIC,
  margen_comisionable NUMERIC,
  margen_pct NUMERIC,
  items_total INTEGER,
  items_excluidos INTEGER,
  items_comisionables INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH exclusiones_activas AS (
    SELECT e.tipo, e.valor
    FROM distrimm_comisiones_exclusiones e
    WHERE e.activa = TRUE
  ),
  ventas_con_exclusion AS (
    SELECT
      v.*,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM exclusiones_activas ea
          WHERE ea.tipo = 'producto' AND ea.valor = v.producto_codigo
        ) THEN TRUE
        WHEN EXISTS (
          SELECT 1 FROM exclusiones_activas ea
          JOIN distrimm_productos_catalogo p ON p.marca = ea.valor AND ea.tipo = 'marca'
          WHERE p.codigo = v.producto_codigo
        ) THEN TRUE
        ELSE FALSE
      END AS excluido
    FROM distrimm_comisiones_ventas v
    WHERE v.carga_id = p_carga_id
  )
  SELECT
    ve.vendedor_codigo,
    ve.vendedor_nombre,
    SUM(ve.valor_total)::NUMERIC                                                        AS total_ventas,
    SUM(ve.costo)::NUMERIC                                                              AS total_costo,
    SUM(CASE WHEN ve.excluido     THEN ve.valor_total ELSE 0 END)::NUMERIC              AS ventas_excluidas,
    -- CHANGED: base comisionable = costo (DV tienen costo negativo → restan automáticamente)
    SUM(CASE WHEN NOT ve.excluido THEN ve.costo       ELSE 0 END)::NUMERIC              AS ventas_comisionables,
    SUM(CASE WHEN NOT ve.excluido THEN ve.costo       ELSE 0 END)::NUMERIC              AS costo_comisionable,
    SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total - ve.costo ELSE 0 END)::NUMERIC   AS margen_comisionable,
    CASE
      WHEN SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END) > 0
      THEN (
        SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total - ve.costo ELSE 0 END) /
        SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END) * 100
      )::NUMERIC
      ELSE 0
    END                                                                                 AS margen_pct,
    COUNT(*)::INTEGER                                                                   AS items_total,
    SUM(CASE WHEN ve.excluido     THEN 1 ELSE 0 END)::INTEGER                           AS items_excluidos,
    SUM(CASE WHEN NOT ve.excluido THEN 1 ELSE 0 END)::INTEGER                           AS items_comisionables
  FROM ventas_con_exclusion ve
  GROUP BY ve.vendedor_codigo, ve.vendedor_nombre
  ORDER BY ventas_comisionables DESC;
END;
$$;
```

**Diferencia clave vs versión anterior:**
- `ventas_comisionables`: `valor_total` → `costo`
- `costo_comisionable`: sin cambio (sigue siendo `costo`)
- `margen_pct` denominator: sigue usando `valor_total` (margen como % de ventas — más estándar)

**Step 2: Ejecutar en Supabase**

Dashboard → SQL Editor → New query → pegar → Run.

**Step 3: Verificar con datos de prueba**

```sql
-- Reemplazar con un carga_id real de tu base de datos:
SELECT * FROM fn_calcular_comisiones('00000000-0000-0000-0000-000000000000');
```

Si la tabla tiene datos, `ventas_comisionables` ahora refleja `costo`, no `valor_total`.

---

## Task 3: VentasUploadModal — Parsing con tipo y signo

**Files:**
- Modify: `src/components/comisiones/VentasUploadModal.jsx:59–84`

**Contexto:** El `map` actual ignora la columna 29. Necesitamos:
1. Leer `tipo` de la columna 29 (0-indexed)
2. Si `tipo === "DV"`, invertir el signo de `valor_total` y `costo`
3. Mantener el `.filter()` tal cual (DVs tienen `valor_total !== 0`)

**Step 1: Read the file**

Read `src/components/comisiones/VentasUploadModal.jsx` lines 59-95 to confirm the exact current content of the `processed` map.

**Step 2: Modificar el `map` (líneas 65-82)**

Encontrar el bloque `return { ... }` dentro del `.map((row) => {...})` (líneas ~65-82) y reemplazarlo:

```js
// BEFORE (lines 65-82):
            return {
              vendedor_codigo: String(get(0) || "").trim(),
              vendedor_nit: String(get(1) || "").trim(),
              vendedor_nombre: String(get(2) || "").trim(),
              producto_codigo: String(get(3) || "").trim(),
              producto_descripcion: String(get(5) || "").trim(),
              cliente_nit: String(get(6) || "").trim(),
              cliente_nombre: String(get(7) || "").trim(),
              municipio: String(get(9) || "").trim(),
              fecha_raw: get(10),
              factura: String(get(15) || "").trim(),
              precio: num(17),
              descuento: num(18),
              valor_unidad: num(19),
              cantidad: num(20),
              valor_total: num(24),
              costo: num(27),
            };

// AFTER:
            const tipo = String(get(29) || "VE").trim().toUpperCase();
            const sign = tipo === "DV" ? -1 : 1;
            return {
              vendedor_codigo: String(get(0) || "").trim(),
              vendedor_nit: String(get(1) || "").trim(),
              vendedor_nombre: String(get(2) || "").trim(),
              producto_codigo: String(get(3) || "").trim(),
              producto_descripcion: String(get(5) || "").trim(),
              cliente_nit: String(get(6) || "").trim(),
              cliente_nombre: String(get(7) || "").trim(),
              municipio: String(get(9) || "").trim(),
              fecha_raw: get(10),
              factura: String(get(15) || "").trim(),
              precio: num(17),
              descuento: num(18),
              valor_unidad: num(19),
              cantidad: num(20),
              valor_total: sign * num(24),
              costo: sign * num(27),
              tipo,
            };
```

**Step 3: Build**

```bash
pnpm build
```

Expected: 0 errors.

---

## Task 4: VentasUploadModal — Insert con campo `tipo`

**Files:**
- Modify: `src/components/comisiones/VentasUploadModal.jsx:142–160`

**Contexto:** El objeto `rows` que se inserta en Supabase no incluye `tipo`. Debe agregarse para que la columna recién añadida reciba el valor correcto.

**Step 1: Encontrar el bloque `rows`**

En `handleUpload` (línea ~142), está el mapeo de `fullData` a `rows`. Actualmente termina con:
```js
        valor_total: r.valor_total,
        costo: r.costo,
      }));
```

**Step 2: Agregar `tipo` al objeto**

Agregar una línea después de `costo`:
```js
        valor_total: r.valor_total,
        costo: r.costo,
        tipo: r.tipo || "VE",
      }));
```

**Step 3: Build**

```bash
pnpm build
```

Expected: 0 errors.

---

## Task 5: VentasUploadModal — Preview UI con badge Tipo y resumen

**Files:**
- Modify: `src/components/comisiones/VentasUploadModal.jsx` — sección `step === "preview"`

**Contexto:** La tabla de preview tiene 5 columnas (Vendedor, Producto, Cliente, Valor Total, Costo). Agregar "Tipo" como primera columna con badge de color. El banner amber dice "Se encontraron X lineas de venta" — actualizarlo para mostrar desglose VE/DV.

**Step 1: Actualizar el banner amber (línea ~263)**

Encontrar:
```jsx
                  <p className="text-sm text-amber-700">Se encontraron {fullData.length} lineas de venta. Fecha: {fechaVentas}</p>
```

Reemplazar con:
```jsx
                  {(() => {
                    const ventas = fullData.filter(r => r.tipo !== "DV").length;
                    const devol = fullData.filter(r => r.tipo === "DV").length;
                    return (
                      <p className="text-sm text-amber-700">
                        {ventas} ventas y {devol} devoluciones ({fullData.length} total). Fecha: {fechaVentas}
                      </p>
                    );
                  })()}
```

**Step 2: Agregar columna "Tipo" al `<thead>`**

Encontrar el `<thead>` de la tabla preview:
```jsx
                      <tr>
                        <th className="px-3 py-2">Vendedor</th>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2 text-right">Valor Total</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                      </tr>
```

Reemplazar con:
```jsx
                      <tr>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Vendedor</th>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2 text-right">Valor Total</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                      </tr>
```

**Step 3: Agregar celda "Tipo" a cada fila del `<tbody>`**

Encontrar el `<tr key={i}>` de cada fila preview:
```jsx
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs">{row.vendedor_nombre || row.vendedor_codigo}</td>
```

Agregar la celda Tipo ANTES de vendedor:
```jsx
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                              row.tipo === "DV"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {row.tipo || "VE"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs">{row.vendedor_nombre || row.vendedor_codigo}</td>
```

**Step 4: Build**

```bash
pnpm build
```

Expected: 0 errors.

**Step 5: Verificar visualmente**

```bash
pnpm dev
```

Ir al módulo de Comisiones → Cargar Ventas → seleccionar un Excel de ventas real → Analizar. El preview debe mostrar:
- Banner: "X ventas y Y devoluciones (Z total)"
- Primera columna: badges verdes (VE) y rojos (DV)
- Filas DV con `valor_total` y `costo` negativos

---

## Final Verification

```bash
pnpm build
```

Expected: ✅ 0 errors.

Verificar manualmente en el SQL editor de Supabase:
```sql
-- Después de una carga real, verificar que las DV tienen valores negativos:
SELECT tipo, valor_total, costo, margen_valor
FROM distrimm_comisiones_ventas
WHERE tipo = 'DV'
LIMIT 5;
-- Expected: valor_total < 0, costo < 0, margen_valor = valor_total - costo

-- Verificar que la RPC suma correctamente:
SELECT vendedor_codigo, ventas_comisionables, costo_comisionable
FROM fn_calcular_comisiones('<carga_id>');
-- Expected: ventas_comisionables = costo_comisionable (son iguales en la nueva versión)
-- y el valor ya descuenta las DV
```
