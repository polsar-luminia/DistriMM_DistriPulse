#!/usr/bin/env bash
# ──────────────────────────────────────────────────────
# Auditoría automática con OpenClaw — DistriMM
# Ejecutar: bash scripts/openclaw-audit.sh
#
# Recorre frentes de auditoría uno por uno.
# Guarda hallazgos en audit-reports/.
# Se detiene cuando todos los frentes están completos.
# ──────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORTS_DIR="$PROJECT_DIR/audit-reports"
PROGRESS_FILE="$REPORTS_DIR/_progress.json"

mkdir -p "$REPORTS_DIR"

# ── Inicializar progreso si no existe ──
if [ ! -f "$PROGRESS_FILE" ]; then
cat > "$PROGRESS_FILE" << 'PROGRESS'
{
  "frentes": [
    {
      "id": "01-calculos-comisiones",
      "nombre": "Cálculos de comisiones por tramos",
      "archivos": ["src/utils/comisionesCalculator.js", "src/hooks/comisiones/useComisionesCalculo.js"],
      "enfoque": "Precisión numérica, divisiones por cero, redondeo COP, tramos acumulativos, edge cases con 0% cumplimiento o >200%",
      "estado": "pendiente"
    },
    {
      "id": "02-etl-ventas",
      "nombre": "ETL Upload de Ventas",
      "archivos": ["src/components/comisiones/VentasUploadModal.jsx", "src/utils/comisionesCalculator.js"],
      "enfoque": "Validación de columnas Excel, normalización de marcas, duplicados, rollback atómico en error, tipos de dato",
      "estado": "pendiente"
    },
    {
      "id": "03-etl-recaudo",
      "nombre": "ETL Upload de Recaudo",
      "archivos": ["src/components/comisiones/RecaudoUploadModal.jsx", "src/utils/recaudoUpload.js"],
      "enfoque": "Matching de facturas, montos negativos, recaudo parcial vs total, rollback, manejo de archivos vacíos",
      "estado": "pendiente"
    },
    {
      "id": "04-etl-iva",
      "nombre": "ETL Upload de IVA",
      "archivos": ["src/components/comisiones/IvaUploadModal.jsx", "src/utils/ivaUpload.js"],
      "enfoque": "Cálculo correcto de IVA 19%, matching con ventas, valores negativos, archivos mal formateados",
      "estado": "pendiente"
    },
    {
      "id": "05-servicios-rpc",
      "nombre": "Servicios Supabase y RPC",
      "archivos": ["src/services/comisionesService.js", "sql/distrimm_comisiones_extended.sql", "sql/fn_upload_ventas.sql", "sql/fn_upload_recaudos.sql"],
      "enfoque": "Race conditions, atomicidad transaccional, CASCADE, manejo de errores RPC, SQL injection en queries dinámicas",
      "estado": "pendiente"
    },
    {
      "id": "06-reportes-pdf-excel",
      "nombre": "Generación de reportes PDF y Excel",
      "archivos": ["src/utils/reportePDF.js", "src/utils/reporteExcelMensual.js"],
      "enfoque": "Datos faltantes/null, formateo COP, columnas desalineadas, vendedores sin datos, meses sin ventas",
      "estado": "pendiente"
    },
    {
      "id": "07-tabs-comisiones",
      "nombre": "Tabs del módulo de comisiones",
      "archivos": ["src/components/comisiones/VentasTab.jsx", "src/components/comisiones/RecaudoTab.jsx", "src/components/comisiones/CatalogoTab.jsx", "src/components/comisiones/PresupuestosTab.jsx"],
      "enfoque": "Memory leaks useEffect, race conditions en fetches, estados loading/error, re-renders innecesarios",
      "estado": "pendiente"
    },
    {
      "id": "08-reporte-vendedor",
      "nombre": "Reporte por vendedor y mensual",
      "archivos": ["src/components/comisiones/ReporteVendedorDetail.jsx", "src/components/comisiones/ReporteMensualTab.jsx"],
      "enfoque": "Cálculos derivados consistentes, vendedor sin presupuesto, división por cero en porcentajes, datos parciales",
      "estado": "pendiente"
    },
    {
      "id": "09-page-y-contexto",
      "nombre": "ComisionesPage y flujo de datos",
      "archivos": ["src/pages/ComisionesPage.jsx"],
      "enfoque": "Propagación de estado, sincronización entre tabs, refresh después de upload, contexto perdido",
      "estado": "pendiente"
    },
    {
      "id": "10-tests-existentes",
      "nombre": "Cobertura y calidad de tests",
      "archivos": ["src/utils/__tests__/comisionesCalculator.test.js", "src/utils/__tests__/ivaUpload.test.js", "src/utils/__tests__/recaudoUpload.test.js"],
      "enfoque": "Tests que pasan pero no verifican nada, edge cases no cubiertos, mocks que ocultan bugs reales",
      "estado": "pendiente"
    },
    {
      "id": "11-seguridad-general",
      "nombre": "Seguridad: XSS, injection, secrets",
      "archivos": ["src/"],
      "enfoque": "innerHTML/dangerouslySetInnerHTML, eval, secrets en frontend, RLS bypass, inputs sin sanitizar",
      "estado": "pendiente"
    },
    {
      "id": "12-edge-functions",
      "nombre": "Supabase Edge Functions",
      "archivos": ["supabase/functions/"],
      "enfoque": "Validación de input, timeouts, error handling, secrets expuestos, CORS, auth bypass",
      "estado": "pendiente"
    }
  ]
}
PROGRESS
echo "Archivo de progreso creado: $PROGRESS_FILE"
fi

# ── Función: obtener siguiente frente pendiente ──
get_next_frente() {
  node -e "
    const p = require('$PROGRESS_FILE');
    const next = p.frentes.find(f => f.estado === 'pendiente');
    if (next) {
      console.log(JSON.stringify(next));
    } else {
      console.log('DONE');
    }
  "
}

# ── Función: marcar frente como completado ──
mark_complete() {
  local frente_id="$1"
  node -e "
    const fs = require('fs');
    const path = '$PROGRESS_FILE';
    const p = JSON.parse(fs.readFileSync(path, 'utf8'));
    const f = p.frentes.find(f => f.id === '$frente_id');
    if (f) {
      f.estado = 'completado';
      f.fecha_completado = new Date().toISOString();
    }
    fs.writeFileSync(path, JSON.stringify(p, null, 2));
  "
}

# ── Función: contar progreso ──
show_progress() {
  node -e "
    const p = require('$PROGRESS_FILE');
    const total = p.frentes.length;
    const done = p.frentes.filter(f => f.estado === 'completado').length;
    console.log('Progreso: ' + done + '/' + total + ' frentes completados');
  "
}

# ── Loop principal ──
echo ""
echo "========================================="
echo "  AUDITORÍA AUTOMÁTICA — DistriMM"
echo "========================================="
show_progress
echo ""

while true; do
  NEXT=$(get_next_frente)

  if [ "$NEXT" = "DONE" ]; then
    echo ""
    echo "========================================="
    echo "  AUDITORÍA COMPLETA"
    echo "========================================="
    echo "Todos los frentes han sido revisados."
    echo "Reportes en: $REPORTS_DIR/"
    show_progress
    exit 0
  fi

  FRENTE_ID=$(echo "$NEXT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id)")
  FRENTE_NOMBRE=$(echo "$NEXT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).nombre)")
  FRENTE_ARCHIVOS=$(echo "$NEXT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).archivos.join(', '))")
  FRENTE_ENFOQUE=$(echo "$NEXT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).enfoque)")

  REPORT_FILE="$REPORTS_DIR/${FRENTE_ID}.md"

  echo "─────────────────────────────────────────"
  echo "Auditando: $FRENTE_NOMBRE"
  echo "Archivos:  $FRENTE_ARCHIVOS"
  echo "─────────────────────────────────────────"

  # ── Prompt para OpenClaw ──
  AUDIT_PROMPT="Eres un auditor de código senior especializado en aplicaciones financieras.

CONTEXTO: Proyecto DistriMM — app de gestión de distribución colombiana (COP). React 19 + Vite + Supabase.
DIRECTORIO: $PROJECT_DIR

FRENTE DE AUDITORÍA: $FRENTE_NOMBRE
ARCHIVOS A REVISAR: $FRENTE_ARCHIVOS
ENFOQUE ESPECÍFICO: $FRENTE_ENFOQUE

INSTRUCCIONES:
1. Lee CADA archivo listado completo (usa cat o lee el archivo)
2. Analiza línea por línea buscando:
   - Bugs concretos (no teóricos — debe poder reproducirse)
   - Cálculos frágiles (parseFloat en dinero, divisiones sin guardia, acumuladores con floating point)
   - Race conditions (async sin await, useEffect sin cleanup, fetches paralelos que pisan estado)
   - Edge cases no manejados (arrays vacíos, null/undefined, strings donde esperan números)
   - Errores silenciados (catch vacío, .catch(() => {}))
   - Seguridad (innerHTML, eval, SQL dinámico, secrets hardcodeados)
3. Para CADA hallazgo reporta:

   ### [CRÍTICO|ALTO|MEDIO|BAJO] archivo:línea — Título corto
   **Código actual:**
   \`\`\`js
   // línea exacta con el problema
   \`\`\`
   **Problema:** Explicación precisa de qué falla y cuándo
   **Impacto:** Qué consecuencia tiene para el usuario/datos
   **Fix sugerido:**
   \`\`\`js
   // código corregido
   \`\`\`

4. NO reportes:
   - Sugerencias de estilo o refactor cosmético
   - Problemas hipotéticos que requieren condiciones imposibles
   - Falta de TypeScript o de tests (eso es otro frente)

5. Al final incluye un RESUMEN con conteo por severidad.

Guarda el reporte completo en: $REPORT_FILE"

  # ── Ejecutar OpenClaw ──
  openclaw run "$AUDIT_PROMPT" 2>&1 | tee -a "$REPORTS_DIR/_audit.log"

  # ── Verificar que se generó el reporte ──
  if [ -f "$REPORT_FILE" ]; then
    echo "Reporte generado: $REPORT_FILE"
  else
    # Si OpenClaw no guardó el archivo, capturar output como reporte
    echo "NOTA: OpenClaw no guardó archivo. Capturando output del log..."
    echo "# Auditoría: $FRENTE_NOMBRE" > "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Revisar _audit.log para los hallazgos de este frente." >> "$REPORT_FILE"
  fi

  # ── Marcar completado ──
  mark_complete "$FRENTE_ID"
  show_progress
  echo ""

  # Pausa breve entre frentes para no saturar la API
  sleep 5
done
