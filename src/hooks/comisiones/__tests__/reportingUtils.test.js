import { describe, expect, test } from "vitest";
import {
  buildReporteMensualState,
  dedupeRecaudosByCargaId,
} from "../reportingUtils";

describe("dedupeRecaudosByCargaId", () => {
  test("conserva duplicados legítimos entre cargas distintas", () => {
    const rows = [
      {
        carga_id: "c1",
        cliente_nit: "9001",
        factura: "F-1",
        valor_recaudo: 1000,
      },
      {
        carga_id: "c2",
        cliente_nit: "9001",
        factura: "F-1",
        valor_recaudo: 1000,
      },
    ];

    expect(dedupeRecaudosByCargaId(rows)).toHaveLength(2);
  });

  test("elimina duplicados dentro de la misma carga", () => {
    const rows = [
      {
        carga_id: "c1",
        cliente_nit: "9001",
        factura: "F-1",
        valor_recaudo: 1000,
      },
      {
        carga_id: "c1",
        cliente_nit: "9001",
        factura: "F-1",
        valor_recaudo: 1000,
      },
    ];

    expect(dedupeRecaudosByCargaId(rows)).toHaveLength(1);
  });
});

describe("buildReporteMensualState", () => {
  test("marca el reporte como snapshot cuando hay snapshot", () => {
    const result = buildReporteMensualState({
      cargas: [{ id: "c1" }],
      ventas: [{ id: "v1" }],
      recaudos: [{ id: "r1" }],
      presupuestosMarca: [],
      presupuestosRecaudo: [],
      liquidacion: [{ id: "l1" }],
      snapshotTotales: { totalVentas: 1 },
      year: 2026,
      month: 3,
      isSnapshot: true,
      isStale: true,
      snapshotDate: "2026-03-20T10:00:00Z",
    });

    expect(result.isSnapshot).toBe(true);
    expect(result.isStale).toBe(true);
    expect(result.snapshotDate).toBe("2026-03-20T10:00:00Z");
  });

  test("degrada a reporte vivo cuando no se pudo guardar snapshot", () => {
    const result = buildReporteMensualState({
      cargas: [{ id: "c1" }],
      ventas: [{ id: "v1" }],
      recaudos: [{ id: "r1" }],
      presupuestosMarca: [],
      presupuestosRecaudo: [],
      liquidacion: [{ id: "l1" }],
      snapshotTotales: { totalVentas: 1 },
      year: 2026,
      month: 3,
      isSnapshot: false,
      isStale: false,
      snapshotDate: "2026-03-20T10:00:00Z",
    });

    expect(result.isSnapshot).toBe(false);
    expect(result.isStale).toBe(false);
    expect(result.snapshotDate).toBeNull();
  });
});
