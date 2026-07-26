/**
 * distrimm-sms — servicio Express autocontenido en el VPS.
 * Expone el canal SMS (LabsMobile) como fallback de WhatsApp para recordatorios
 * de cobranza. Se publica detras de nginx en /api/ (proxy a localhost:3103).
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const smsRoutes = require("./routes/sms");

const app = express();
const PORT = Number(process.env.PORT) || 3103;

const allowed = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Permite herramientas sin origin (curl) y los origins de la lista.
      if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      return cb(new Error(`Origen no permitido: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.use("/sms", smsRoutes);

app.get("/", (_req, res) => res.json({ service: "distrimm-sms", ok: true }));

// Manejo de errores (incluye rechazos de CORS).
app.use((err, _req, res, _next) => {
  console.error("[distrimm-sms] Error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Error interno" });
});

app.listen(PORT, () => {
  console.log(`[distrimm-sms] escuchando en :${PORT}`);
});
