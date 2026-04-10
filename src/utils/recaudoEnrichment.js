import { supabase } from "../lib/supabase";
import {
  buildExclusionLookups,
  getExclusionInfo,
} from "../hooks/comisiones/utils";

/**
 * Ejecuta queries `.in()` en lotes de 200 para evitar límites de Supabase.
 */
export async function batchIN(table, selectCols, field, ids, orderCol) {
  const BATCH = 200;
  const PAGE = 1000;
  const all = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let from = 0;
    while (true) {
      let q = supabase
        .from(table)
        .select(selectCols)
        .in(field, chunk)
        .range(from, from + PAGE - 1);
      if (orderCol) q = q.order(orderCol, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      if (data) all.push(...data);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }
  return all;
}

/**
 * Enriquece filas de recaudo con exclusiones de marca/producto.
 * Cruza factura → ventas → catálogo → exclusiones.
 */
export async function enrichRecaudoExclusions(rows) {
  const facturas = [...new Set(rows.map((r) => r.factura).filter(Boolean))];
  if (facturas.length === 0) return rows;

  const facturasConPrefijo = facturas.flatMap((f) => [`FELE-${f}`, `FCI-${f}`]);

  try {
    const [ventasRows, catalogo, exclusiones] = await Promise.all([
      batchIN(
        "distrimm_comisiones_ventas",
        "factura, producto_codigo, valor_total",
        "factura",
        facturasConPrefijo,
      ),
      (async () => {
        // Paginar catálogo completo (Supabase limita a 1000 por query)
        const all = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("distrimm_productos_catalogo")
            .select("codigo, marca")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (data) all.push(...data);
          if (!data || data.length < PAGE) break;
          from += PAGE;
        }
        return all;
      })(),
      supabase
        .from("distrimm_comisiones_exclusiones")
        .select("tipo, valor")
        .eq("activa", true)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),
    ]);

    const { productExclusionSet, brandExclusionSet, productBrandMap } =
      exclusiones.length > 0
        ? buildExclusionLookups(exclusiones, catalogo)
        : {
            productExclusionSet: new Set(),
            brandExclusionSet: new Set(),
            productBrandMap: {},
          };

    // Mapear factura (sin prefijo) → lista de { producto_codigo, valor_total }
    const facturaProductos = {};
    ventasRows.forEach((v) => {
      const num = String(v.factura || "").replace(/^(FELE|FCI)-/, "");
      if (!num || !v.producto_codigo) return;
      if (!facturaProductos[num]) facturaProductos[num] = [];
      facturaProductos[num].push({
        codigo: v.producto_codigo,
        valorTotal: Number(v.valor_total) || 0,
      });
    });

    return rows.map((row) => {
      const productos = facturaProductos[row.factura];
      if (!productos || productos.length === 0) return row;

      // --- Exclusiones de marca (proporcional al valor de venta) ---
      let ventaExcluida = 0;
      let ventaTotal = 0;
      productos.forEach((p) => {
        const info = getExclusionInfo(
          p.codigo,
          productExclusionSet,
          brandExclusionSet,
          productBrandMap,
        );
        ventaTotal += p.valorTotal;
        if (info.excluded) ventaExcluida += p.valorTotal;
      });

      // IVA no se calcula: la columna "Base" del Excel ya viene neta de IVA
      let valorExcluidoMarca = 0;
      if (ventaExcluida > 0 && ventaTotal > 0) {
        const proporcion = ventaExcluida / ventaTotal;
        valorExcluidoMarca = Math.round(proporcion * row.valor_recaudo);
      }

      return {
        ...row,
        _valor_excluido_marca:
          valorExcluidoMarca || row._valor_excluido_marca || 0,
        _valor_iva: 0,
      };
    });
  } catch (err) {
    if (import.meta.env.DEV)
      console.warn("[enrichRecaudoExclusions] Error:", err.message);
    return rows.map((r) => ({ ...r, _enrichment_failed: true }));
  }
}

/**
 * Enriquece filas RC con datos de clientes y cartera desde Supabase.
 * @param {Array} rows - Filas transformadas de RC
 * @returns {Promise<Array>} Filas con nombre, vendedor, mora
 */
export async function enrichFromDB(rows) {
  const nits = [...new Set(rows.map((r) => r.cliente_nit).filter(Boolean))];
  const facturas = [...new Set(rows.map((r) => r.factura).filter(Boolean))];
  // Buscar con todos los prefijos de factura del ERP (FELE- y FCI-)
  const facturasConPrefijo = facturas.flatMap((f) => [`FELE-${f}`, `FCI-${f}`]);

  let clientes = [];
  let items = [];
  let ventasVendedor = [];
  try {
    [clientes, items, ventasVendedor] = await Promise.all([
      nits.length > 0
        ? batchIN(
            "distrimm_clientes",
            "no_identif, nombre_completo, vendedor_codigo",
            "no_identif",
            nits,
          )
        : [],
      facturas.length > 0
        ? batchIN(
            "cartera_items",
            "id, documento_id, tercero_nit, fecha_emision, fecha_vencimiento, dias_mora, vendedor_codigo, valor_saldo",
            "documento_id",
            facturas,
            "id",
          )
        : [],
      // Buscar vendedor y fecha en ventas por factura (FELE-XXXXX)
      facturasConPrefijo.length > 0
        ? batchIN(
            "distrimm_comisiones_ventas",
            "factura, vendedor_codigo, fecha",
            "factura",
            facturasConPrefijo,
          )
        : [],
    ]);
  } catch (err) {
    if (import.meta.env.DEV)
      console.warn("[enrichFromDB] Error cargando datos:", err.message);
  }

  const clienteMap = Object.fromEntries(
    clientes.map((c) => [String(c.no_identif), c]),
  );

  // Object.fromEntries toma el último duplicado; order ascending → más reciente gana
  const carteraMap = Object.fromEntries(
    items.map((c) => [String(c.documento_id), c]),
  );

  // Fallback: vendedor por NIT desde cartera (si una factura del mismo NIT tiene vendedor, usarlo)
  const nitVendedorCartera = {};
  items.forEach((c) => {
    const nit = String(c.tercero_nit || "").trim();
    if (nit && c.vendedor_codigo && !nitVendedorCartera[nit]) {
      nitVendedorCartera[nit] = c.vendedor_codigo;
    }
  });

  // Mapeo factura (sin prefijo) → { vendedor_codigo, fecha } de ventas
  const ventaInfoMap = {};
  ventasVendedor.forEach((v) => {
    const num = String(v.factura || "").replace(/^(FELE|FCI)-/, "");
    if (!num) return;
    // Guardar el primer match (no sobreescribir si ya existe)
    if (!ventaInfoMap[num]) {
      ventaInfoMap[num] = {
        vendedor_codigo: v.vendedor_codigo || "",
        fecha: v.fecha || null,
      };
    }
  });

  return rows.map((row) => {
    const c = clienteMap[row.cliente_nit];
    const f = carteraMap[row.factura];
    const venta = ventaInfoMap[row.factura];

    let diasMora;
    let sinMatch = !f;

    // Calcular días desde EMISIÓN hasta PAGO (no desde vencimiento)
    const fechaAbono = row.fecha_abono
      ? new Date(row.fecha_abono + "T12:00:00")
      : null;

    if (f?.fecha_emision && fechaAbono) {
      // Match en cartera → calcular días desde emisión hasta pago (mínimo 0)
      const fechaEmision = new Date(f.fecha_emision + "T12:00:00");
      diasMora = Math.max(
        0,
        Math.round((fechaAbono - fechaEmision) / 86400000),
      );
    } else if (venta?.fecha && fechaAbono) {
      // Sin match en cartera pero SÍ en ventas → calcular días desde venta hasta pago (mínimo 0)
      const fechaVenta = new Date(venta.fecha + "T12:00:00");
      diasMora = Math.max(0, Math.round((fechaAbono - fechaVenta) / 86400000));
      sinMatch = false;
    } else if (f) {
      // Match en cartera pero sin fecha_emision → fallback a dias_mora de cartera
      diasMora = f.dias_mora ?? 0;
    } else {
      // Sin match en ningún lado → desconocido
      diasMora = -1;
    }

    // Vendedor prioridad: ventas (por factura) → cartera (por factura) → cartera (por NIT) → clientes maestro
    const vendedorVenta = venta?.vendedor_codigo;
    const vendedorCarteraNit = nitVendedorCartera[row.cliente_nit];

    // Mantener valor_recaudo del RC (lo que realmente se pagó, no el saldo total de la factura)
    return {
      ...row,
      cliente_nombre: c?.nombre_completo || row.cliente_nit,
      vendedor_codigo:
        vendedorVenta ||
        f?.vendedor_codigo ||
        vendedorCarteraNit ||
        c?.vendedor_codigo ||
        "",
      fecha_cxc: f?.fecha_emision || venta?.fecha || null,
      fecha_vence: f?.fecha_vencimiento || null,
      dias_mora: diasMora,
      _sinMatchCartera: sinMatch,
    };
  });
}
