import { parse, isValid } from "date-fns";
import { es } from "date-fns/locale";

// --- FILE TYPE DETECTION ---
export const UPLOAD_TYPES = {
  CARTERA: "cartera",
  CLIENTES: "clientes",
};

// --- ROBUST DATE PARSER (ETL) ---
export const parseFlexibleDate = (rawDate) => {
  if (!rawDate) return null;

  // 1. Handle Excel Serial Numbers (e.g., 45312)
  if (typeof rawDate === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + rawDate * 86400000);
    // Adjust fortimezone offset to prevent date shifting
    const adjustedDate = new Date(date.valueOf() + date.getTimezoneOffset() * 60000);
    return isValid(adjustedDate) ? adjustedDate : null;
  }

  // 2. Handle Strings
  if (typeof rawDate === "string") {
    const cleanDate = rawDate.trim();

    // Attempt multiple formats
    const formatsToTry = [
      "dd/MM/yyyy", // Colombian Standard
      "d/M/yyyy",   // Single digits
      "yyyy-MM-dd", // ISO
      "MM/dd/yyyy", // US (Fallback)
      "dd-MM-yyyy",
    ];

    for (const fmt of formatsToTry) {
      const parsedDate = parse(cleanDate, fmt, new Date(), { locale: es });
      if (isValid(parsedDate) && parsedDate.getFullYear() > 2000 && parsedDate.getFullYear() < 2100) {
        return parsedDate;
      }
    }
  }

  return null; // Unable to parse
};

export const detectFileType = (headers) => {
  const headerSet = new Set(headers.map((h) => h?.toLowerCase()?.trim()));

  // Clientes file has these distinctive columns
  const clienteMarkers = ["primer nombre", "primer apellido", "no identif", "tipo ident", "genero"];
  const clienteMatch = clienteMarkers.filter((m) => headerSet.has(m)).length;

  // Cartera file has these distinctive columns
  const carteraMarkers = ["nombre tercero", "dias mora", "valor saldo", "vence", "documento"];
  const carteraMatch = carteraMarkers.filter((m) => headerSet.has(m)).length;

  if (clienteMatch >= 3) return UPLOAD_TYPES.CLIENTES;
  if (carteraMatch >= 2) return UPLOAD_TYPES.CARTERA;

  return null;
};

// --- PROCESS CARTERA DATA ---
export const processCarteraData = (jsonData) => {
  return jsonData
    .map((row, index) => {
      const rawFecha = row["Fecha"];
      const rawVence = row["Vence"];
      const fechaEmision = parseFlexibleDate(rawFecha);
      const fechaVencimiento = parseFlexibleDate(rawVence);

      return {
        originalIndex: index,
        cliente_nombre:
          row["Nombre Tercero"] ||
          row["Cliente"] ||
          row["Tercero"] ||
          "Desconocido",
        documento_id: row["Documento"] || row["Nit"] || row["ID"] || "",
        rawFecha,
        fecha_emision: fechaEmision,
        rawVence,
        fecha_vencimiento: fechaVencimiento,
        dias_mora: (() => {
          const raw = row["Días Mora"] || row["Dias Mora"] || row["Mora"] || 0;
          const parsed = parseInt(raw, 10);
          return Number.isNaN(parsed) ? 0 : parsed;
        })(),
        valor_saldo: (() => {
          const raw = row["Valor Saldo"] || row["Saldo"] || row["Total"] || 0;
          const cleaned = typeof raw === "string" ? raw.replace(/,/g, "") : raw;
          const parsed = parseFloat(cleaned);
          return Number.isNaN(parsed) ? 0 : parsed;
        })(),
        estado: row["Estado"] || row["Est"],
        // New fields from enriched Excel
        vendedor_codigo: String(row["Vend"] || row["Vendedor"] || "").trim() || null,
        tercero_nit: String(row["Tercero"] || row["NIT"] || row["Nit"] || "").trim() || null,
        cuenta_contable: String(row["Cuenta"] || "").trim() || null,
        nombre_cuenta: String(row["Nombre"] || "").trim() || null,
        cuota: String(row["Cuota"] || "").trim() || null,
      };
    })
    .filter(
      (item) =>
        item.cliente_nombre !== "Desconocido" && item.valor_saldo !== 0,
    );
};

// --- PROCESS CLIENTES DATA ---
export const processClientesData = (jsonData) => {
  return jsonData
    .map((row, index) => {
      const rawFechaNac = row["Fecha Nacimiento"] || row["Fecha Nace"];
      const fechaNacimiento = parseFlexibleDate(rawFechaNac);

      // Build full name for display
      const parts = [
        row["Primer Nombre"],
        row["Segundo Nombre"],
        row["Primer Apellido"],
        row["Segundo Apellido"],
      ].filter(Boolean);
      const nombreCompleto = parts.join(" ").trim() || "Sin Nombre";

      return {
        originalIndex: index,
        no_identif: String(row["No Identif"] || row["NIT"] || row["Nit"] || "").trim(),
        tipo_ident: row["Tipo Ident"] || "NIT",
        tipo_persona: row["Tipo Persona"] || null,
        primer_nombre: row["Primer Nombre"] || null,
        segundo_nombre: row["Segundo Nombre"] || null,
        primer_apellido: row["Primer Apellido"] || null,
        segundo_apellido: row["Segundo Apellido"] || null,
        nombreCompleto,
        fecha_nacimiento: fechaNacimiento,
        genero: row["Genero"] || null,
        estado_civil: row["Estado Civil"] || null,
        direccion: row["Direccion"] || null,
        telefono_1: String(row["Telefono 1"] || "").trim() || null,
        telefono_2: String(row["Telefono 2"] || "").trim() || null,
        celular: String(row["Num. Celular"] || row["Celular"] || "").trim() || null,
        correo_electronico: row["Correo Electronico"] || null,
        pagina_web: row["Página Web"] || row["Pagina Web"] || null,
        clasificacion_iva: row["Clasificacion Iva"] || null,
        profesion: row["Profesion"] || null,
        actividad: row["Actividad"] || null,
        cupo_venta: parseFloat(row["Vr Cupo Venta"] || 0),
        cupo_compra: parseFloat(row["Vr Cupo Compra"] || 0),
        comentario: row["Comentario"] || null,
        barrio: row["Barrio"] || null,
        municipio: row["Municipio"] || null,
        vendedor_codigo: String(row["Vendedor"] || "").trim() || null,
        cobrador_codigo: String(row["Cobrador"] || "").trim() || null,
      };
    })
    .filter((item) => item.no_identif && item.no_identif !== "0");
};
