import { describe, expect, test } from "vitest";
import {
  buildReporteMensualState,
  dedupeRecaudosDentroDeCarga,
} from "../reportingUtils";

describe("dedupeRecaudosDentroDeCarga", () => {
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

    expect(dedupeRecaudosDentroDeCarga(rows)).toHaveLength(2);
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

    expect(dedupeRecaudosDentroDeCarga(rows)).toHaveLength(1);
  });

  // Este es el caso que rompió la pestaña Recaudo en julio 2026: el mismo
  // abono en la carga manual y en la del ERP. La función NO lo resuelve —lo
  // resuelve el filtro `fuente='erp'` de getRecaudosByPeriodo—, y el test
  // existe para que nadie vuelva a confiar en ella para eso.
  test("NO protege contra el mismo abono en dos fuentes distintas", () => {
    const abono = {
      cliente_nit: "9001",
      factura: "F-1",
      comprobante: "RC-1",
      fecha_abono: "2026-07-15",
      valor_recaudo: 1000,
    };
    const rows = [
      { ...abono, carga_id: "manual-julio", fuente: "manual" },
      { ...abono, carga_id: "erp-julio", fuente: "erp" },
    ];

    expect(dedupeRecaudosDentroDeCarga(rows)).toHaveLength(2);

    // Así es como se evita de verdad: filtrando por fuente aguas arriba
    const soloErp = rows.filter((r) => r.fuente === "erp");
    expect(dedupeRecaudosDentroDeCarga(soloErp)).toHaveLength(1);
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
