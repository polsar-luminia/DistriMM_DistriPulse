import { createClient } from "@supabase/supabase-js";
import {
  TEST_VENDEDOR_CODIGO,
  TEST_VENDEDOR_NOMBRE,
  TEST_CLIENTE_NIT,
  TEST_CLIENTE_NOMBRE,
  TEST_PRODUCTO_CODIGO,
  TEST_MARCA,
} from "./constants";

export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("VITE_SUPABASE_URL and E2E_SUPABASE_SERVICE_KEY are required for e2e seed");
  }

  const supabase = createClient(url, key);

  // 1. Vendedor
  await supabase.from("distrimm_vendedores").upsert(
    { codigo: TEST_VENDEDOR_CODIGO, nombre: TEST_VENDEDOR_NOMBRE },
    { onConflict: "codigo" }
  );

  // 2. Producto catalogo
  await supabase.from("distrimm_productos_catalogo").upsert(
    { codigo: TEST_PRODUCTO_CODIGO, nombre: "Producto E2E Test", marca: TEST_MARCA },
    { onConflict: "codigo" }
  );

  // 3. Cliente
  await supabase.from("distrimm_clientes").upsert(
    {
      no_identif: TEST_CLIENTE_NIT,
      primer_nombre: "E2ETEST",
      primer_apellido: "Cliente",
      celular: "573001234567",
      municipio: "BOGOTA",
      vendedor_codigo: TEST_VENDEDOR_CODIGO,
    },
    { onConflict: "no_identif" }
  );

  // 4. Cartera (for messaging flow)
  const { data: carga } = await supabase
    .from("historial_cargas")
    .insert({
      nombre_archivo: "E2ETEST_cartera.xlsx",
      total_registros: 1,
      fecha_corte: "2025-01-15",
    })
    .select("id")
    .single();

  if (carga) {
    await supabase.from("cartera_items").insert({
      carga_id: carga.id,
      cliente_nombre: TEST_CLIENTE_NOMBRE,
      tercero_nit: TEST_CLIENTE_NIT,
      documento_id: "FAC-E2E-SEED-001",
      nro_factura: "FAC-E2E-SEED-001",
      fecha_emision: "2025-01-01",
      fecha_vencimiento: "2025-01-31",
      dias_mora: 30,
      valor_saldo: 1000000,
      valor_factura: 1000000,
      vendedor_codigo: TEST_VENDEDOR_CODIGO,
    });
  }

  // 5. WhatsApp instance (required by messaging flow — useLotes checks for active instance)
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const testUser = users?.find((u) => u.email === "e2e-test@luminiatech.digital");
  if (testUser) {
    await supabase.from("distrimm_whatsapp_instances").upsert(
      {
        user_id: testUser.id,
        waba_id: "E2ETEST_WABA",
        phone_number_id: "E2ETEST_PHONE",
        phone_display: "+57 300 123 4567",
        business_name: "E2ETEST Business",
        status: "active",
      },
      { onConflict: "user_id,phone_number_id" }
    );
  }

  // 6. Plantilla de mensaje
  // No unique constraint on nombre — delete first, then insert
  await supabase
    .from("distrimm_plantillas_mensajes")
    .delete()
    .eq("nombre", "E2ETEST Recordatorio");
  await supabase.from("distrimm_plantillas_mensajes").insert({
    nombre: "E2ETEST Recordatorio",
    tipo: "recordatorio",
    contenido: "Hola {{cliente}}, le recordamos su saldo pendiente de {{total}}. Detalle: {{detalle_facturas}}",
    activa: true,
  });

  console.log("[e2e seed] Test data seeded successfully");
}
