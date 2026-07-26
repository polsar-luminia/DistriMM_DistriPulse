/**
 * Rutas del servicio SMS.
 *  POST /sms/enviar-lote  -> envia SMS a los destinatarios (fallback de WhatsApp).
 *  GET  /sms/health       -> healthcheck (sin auth).
 *  GET  /sms/webhook      -> (Fase 2) callbacks de estado de LabsMobile (ackurl).
 */

const express = require("express");
const { supabaseAdmin } = require("../supabase");
const { requireAuth } = require("../auth");
const { construirMensaje } = require("../mensaje");
const { enviarSMS } = require("../labsmobile");
const { dentroDeHorarioCobranza } = require("../horario");

const router = express.Router();

const SEND_DELAY_MS = 250; // ~4 req/s, bajo el limite de 10/s de LabsMobile

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Normaliza a msisdn LabsMobile (E.164 sin '+'). Solo moviles Colombia 573XXXXXXXXX. */
function normalizarMsisdn(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("573")) return digits;
  if (digits.length === 10 && digits.startsWith("3")) return "57" + digits;
  return null;
}

/** Recomputa conteos del lote desde el detalle (idempotente; igual que proxy-n8n-whatsapp). */
async function recomputarLote(loteId) {
  if (!loteId) return;
  const { data: rows } = await supabaseAdmin
    .from("distrimm_recordatorios_detalle")
    .select("estado_envio")
    .eq("lote_id", loteId);

  const detalle = rows || [];
  const enviados = detalle.filter((r) => r.estado_envio === "enviado").length;
  const fallidos = detalle.filter((r) => r.estado_envio === "fallido").length;
  const pendientes = detalle.filter((r) => r.estado_envio === "pendiente").length;

  const estado =
    pendientes > 0
      ? "en_proceso"
      : enviados === 0
        ? "fallido"
        : fallidos > 0
          ? "parcial"
          : "completado";

  await supabaseAdmin
    .from("distrimm_recordatorios_lote")
    .update({ enviados, fallidos, estado, updated_at: new Date().toISOString() })
    .eq("id", loteId);
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "distrimm-sms" });
});

router.post("/enviar-lote", requireAuth, async (req, res) => {
  const { lote_id: loteId, items, test = false } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items es requerido (array no vacio)" });
  }
  if (items.length > 500) {
    return res.status(400).json({ error: "Maximo 500 destinatarios por lote" });
  }

  // Horario Ley 2300 (solo canal SMS). En modo test se omite para poder probar.
  if (!test) {
    const horario = dentroDeHorarioCobranza();
    if (!horario.permitido) {
      return res.status(409).json({ error: `Fuera de horario de cobranza: ${horario.motivo}` });
    }
  }

  const ackurl = process.env.SMS_ACK_URL || undefined;
  let enviados = 0;
  let fallidos = 0;
  let omitidos = 0;
  const resultados = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const msisdn = normalizarMsisdn(it.telefono);

    if (!msisdn) {
      omitidos++;
      // Marcar como fallido para que el lote no quede 'pendiente' eternamente.
      if (!test && it.detalle_id) {
        await supabaseAdmin
          .from("distrimm_recordatorios_detalle")
          .update({
            estado_envio: "fallido",
            error_detalle: "Numero no movil; SMS no enviado",
          })
          .eq("id", it.detalle_id);
      }
      resultados.push({ detalle_id: it.detalle_id, ok: false, omitido: true, error: "Telefono no movil/invalido" });
      continue;
    }

    const message = construirMensaje({
      tipo: it.tipo,
      nombre: it.cliente_nombre,
      total: it.total,
      nFacturas: it.n_facturas,
    });

    const r = await enviarSMS({ msisdn, message, ackurl, test: !!test });

    if (r.ok) enviados++;
    else fallidos++;

    // En modo test no tocamos la BD (solo validamos el envio).
    if (!test && it.detalle_id) {
      await supabaseAdmin
        .from("distrimm_recordatorios_detalle")
        .update({
          estado_envio: r.ok ? "enviado" : "fallido",
          canal: "sms",
          sms_subid: r.subid,
          error_detalle: r.ok ? null : r.error,
          enviado_at: r.ok ? new Date().toISOString() : null,
        })
        .eq("id", it.detalle_id);
    }

    resultados.push({ detalle_id: it.detalle_id, ok: r.ok, code: r.code, error: r.error });

    if (i < items.length - 1) await sleep(SEND_DELAY_MS);
  }

  if (!test) await recomputarLote(loteId);

  return res.json({ data: { enviados, fallidos, omitidos, total: items.length, resultados } });
});

// (Fase 2) Webhook de estados de entrega de LabsMobile.
router.get("/webhook", async (req, res) => {
  // ackurl llega como http/GET: subid, acklevel, status, desc, msisdn, timestamp.
  console.log("[distrimm-sms] webhook estado:", JSON.stringify(req.query));
  res.status(200).send("OK");
});

module.exports = router;
