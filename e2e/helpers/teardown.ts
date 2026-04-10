import { createClient } from "@supabase/supabase-js";
import {
  TEST_VENDEDOR_CODIGO,
  TEST_CLIENTE_NIT,
  TEST_PRODUCTO_CODIGO,
} from "./constants";

export default async function globalTeardown() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn("[e2e teardown] Missing env vars, skipping cleanup");
    return;
  }

  const supabase = createClient(url, key);

  // Order matters — children before parents, CASCADE-aware

  // Comisiones snapshots
  await supabase.from("distrimm_comisiones_snapshots")
    .delete().eq("periodo_year", 2025).eq("periodo_month", 1);

  // Comisiones cargas (CASCADE deletes ventas)
  const { data: cargas } = await supabase
    .from("distrimm_comisiones_cargas")
    .select("id")
    .like("nombre_archivo", "%E2ETEST%");
  if (cargas?.length) {
    await supabase.from("distrimm_comisiones_cargas")
      .delete().in("id", cargas.map((c) => c.id));
  }

  // Comisiones cargas recaudo (CASCADE deletes recaudos)
  const { data: cargasR } = await supabase
    .from("distrimm_comisiones_cargas_recaudo")
    .select("id")
    .like("nombre_archivo", "%E2ETEST%");
  if (cargasR?.length) {
    await supabase.from("distrimm_comisiones_cargas_recaudo")
      .delete().in("id", cargasR.map((c) => c.id));
  }

  // Presupuestos
  await supabase.from("distrimm_comisiones_presupuestos_recaudo")
    .delete().eq("vendedor_codigo", TEST_VENDEDOR_CODIGO);
  await supabase.from("distrimm_comisiones_presupuestos_marca")
    .delete().eq("vendedor_codigo", TEST_VENDEDOR_CODIGO);

  // WhatsApp instances
  await supabase.from("distrimm_whatsapp_instances")
    .delete().eq("waba_id", "E2ETEST_WABA");

  // Mensajes — find lotes that have details with our test client NIT
  const { data: testDetalles } = await supabase
    .from("distrimm_recordatorios_detalle")
    .select("lote_id")
    .eq("cliente_nit", TEST_CLIENTE_NIT);
  const testLoteIds = [...new Set((testDetalles || []).map((d) => d.lote_id))];

  await supabase.from("distrimm_recordatorios_detalle")
    .delete().eq("cliente_nit", TEST_CLIENTE_NIT);
  if (testLoteIds.length) {
    await supabase.from("distrimm_recordatorios_lote")
      .delete().in("id", testLoteIds);
  }

  // Cartera
  await supabase.from("cartera_items")
    .delete().eq("tercero_nit", TEST_CLIENTE_NIT);
  await supabase.from("historial_cargas")
    .delete().eq("nombre_archivo", "E2ETEST_cartera.xlsx");

  // Master data
  await supabase.from("distrimm_productos_catalogo")
    .delete().eq("codigo", TEST_PRODUCTO_CODIGO);
  await supabase.from("distrimm_clientes")
    .delete().eq("no_identif", TEST_CLIENTE_NIT);
  await supabase.from("distrimm_vendedores")
    .delete().eq("codigo", TEST_VENDEDOR_CODIGO);
  await supabase.from("distrimm_plantillas_mensajes")
    .delete().eq("nombre", "E2ETEST Recordatorio");

  console.log("[e2e teardown] Test data cleaned up successfully");
}
