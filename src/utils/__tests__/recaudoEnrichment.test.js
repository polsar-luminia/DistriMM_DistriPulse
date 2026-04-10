const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

import { describe, test, expect, beforeEach } from "vitest";
import {
  batchIN,
  enrichFromDB,
  enrichRecaudoExclusions,
} from "../recaudoEnrichment";

// ── Helpers ──

function makeChain(resolveValue = { data: [], error: null }) {
  const chain = {};
  const methods = ["select", "in", "range", "order", "eq"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  // .then() support for thenable chains
  chain.then = (cb) => Promise.resolve(cb(resolveValue));
  // Make the chain itself a thenable (so await works)
  const thenable = Object.assign(Promise.resolve(resolveValue), chain);
  methods.forEach((m) => {
    thenable[m] = chain[m];
  });
  return thenable;
}

function setupMockFrom(tableResponses) {
  mockFrom.mockImplementation((table) => {
    const responses = tableResponses[table] || [{ data: [], error: null }];
    let callIdx = 0;
    const chain = {};
    const methods = ["select", "in", "range", "order", "eq"];
    methods.forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });
    chain.then = (cb) => {
      const res = responses[callIdx] || { data: [], error: null };
      callIdx++;
      return Promise.resolve(cb(res));
    };
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────
// batchIN
// ────────────────────────────────────────────────────
describe("batchIN", () => {
  test("devuelve array vacío si ids está vacío", async () => {
    const result = await batchIN("tabla", "col1", "field", []);
    expect(result).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("ejecuta un solo batch para ≤200 ids", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
    const mockData = [{ col1: "a" }, { col1: "b" }];

    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) => Promise.resolve(cb({ data: mockData, error: null }));
      return chain;
    });

    const result = await batchIN("tabla", "col1", "field", ids);
    expect(result).toEqual(mockData);
    expect(mockFrom).toHaveBeenCalledWith("tabla");
  });

  test("ejecuta múltiples batches para >200 ids", async () => {
    const ids = Array.from({ length: 350 }, (_, i) => `id-${i}`);
    const batch1 = [{ v: 1 }];
    const batch2 = [{ v: 2 }];
    let callCount = 0;

    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) => {
        const data = callCount === 0 ? batch1 : batch2;
        callCount++;
        return Promise.resolve(cb({ data, error: null }));
      };
      return chain;
    });

    const result = await batchIN("tabla", "col1", "field", ids);
    expect(result).toEqual([...batch1, ...batch2]);
  });

  test("aplica orderCol cuando se proporciona", async () => {
    const orderMock = vi.fn();
    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.order = orderMock.mockReturnValue(chain);
      chain.then = (cb) =>
        Promise.resolve(cb({ data: [{ x: 1 }], error: null }));
      return chain;
    });

    await batchIN("tabla", "col1", "field", ["id1"], "id");
    expect(orderMock).toHaveBeenCalledWith("id", { ascending: true });
  });

  test("no aplica orderCol cuando no se proporciona", async () => {
    const orderMock = vi.fn();
    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.order = orderMock.mockReturnValue(chain);
      chain.then = (cb) =>
        Promise.resolve(cb({ data: [{ x: 1 }], error: null }));
      return chain;
    });

    await batchIN("tabla", "col1", "field", ["id1"]);
    expect(orderMock).not.toHaveBeenCalled();
  });

  test("lanza error si supabase devuelve error", async () => {
    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) =>
        Promise.resolve(cb({ data: null, error: { message: "DB error" } }));
      return chain;
    });

    await expect(batchIN("tabla", "col1", "field", ["id1"])).rejects.toEqual({
      message: "DB error",
    });
  });
});

// ────────────────────────────────────────────────────
// enrichFromDB
// ────────────────────────────────────────────────────
describe("enrichFromDB", () => {
  test("retorna filas sin cambios si no hay nits ni facturas", async () => {
    const rows = [{ cliente_nit: "", factura: "" }];
    const result = await enrichFromDB(rows);
    expect(result[0].dias_mora).toBe(-1);
    expect(result[0]._sinMatchCartera).toBe(true);
  });

  test("enriquece con datos de cliente y cartera", async () => {
    const rows = [
      {
        cliente_nit: "900123",
        factura: "12345",
        fecha_abono: "2026-03-15",
        valor_recaudo: 500000,
      },
    ];

    // Mock responses por tabla
    let fromCallIndex = 0;
    const responses = [
      // distrimm_clientes
      {
        data: [
          {
            no_identif: "900123",
            nombre_completo: "EMPRESA ABC",
            vendedor_codigo: "V01",
          },
        ],
        error: null,
      },
      // cartera_items
      {
        data: [
          {
            id: 1,
            documento_id: "12345",
            tercero_nit: "900123",
            fecha_emision: "2026-01-10",
            fecha_vencimiento: "2026-02-10",
            dias_mora: 30,
            vendedor_codigo: "V02",
            valor_saldo: 600000,
          },
        ],
        error: null,
      },
      // distrimm_comisiones_ventas (vendedor por factura)
      {
        data: [
          {
            factura: "FELE-12345",
            vendedor_codigo: "V03",
            fecha: "2026-01-05",
          },
        ],
        error: null,
      },
    ];

    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) => {
        const res = responses[fromCallIndex] || { data: [], error: null };
        fromCallIndex++;
        return Promise.resolve(cb(res));
      };
      return chain;
    });

    const result = await enrichFromDB(rows);

    expect(result[0].cliente_nombre).toBe("EMPRESA ABC");
    // Vendedor prioridad: ventas (V03) > cartera (V02) > NIT cartera > clientes (V01)
    expect(result[0].vendedor_codigo).toBe("V03");
    // dias_mora = días desde emisión (2026-01-10) hasta pago (2026-03-15)
    expect(result[0].dias_mora).toBe(64);
    expect(result[0]._sinMatchCartera).toBe(false);
    expect(result[0].fecha_cxc).toBe("2026-01-10");
    expect(result[0].fecha_vence).toBe("2026-02-10");
  });

  test("prioridad vendedor: cartera por factura si no hay venta", async () => {
    const rows = [
      {
        cliente_nit: "900123",
        factura: "55555",
        fecha_abono: "2026-02-01",
      },
    ];

    let fromCallIndex = 0;
    const responses = [
      // clientes
      {
        data: [
          {
            no_identif: "900123",
            nombre_completo: "TEST",
            vendedor_codigo: "V01",
          },
        ],
        error: null,
      },
      // cartera
      {
        data: [
          {
            id: 1,
            documento_id: "55555",
            tercero_nit: "900123",
            fecha_emision: "2026-01-15",
            fecha_vencimiento: "2026-02-15",
            dias_mora: 10,
            vendedor_codigo: "V02",
            valor_saldo: 100000,
          },
        ],
        error: null,
      },
      // ventas — vacío
      { data: [], error: null },
    ];

    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) => {
        const res = responses[fromCallIndex] || { data: [], error: null };
        fromCallIndex++;
        return Promise.resolve(cb(res));
      };
      return chain;
    });

    const result = await enrichFromDB(rows);
    // Sin venta → usa vendedor de cartera
    expect(result[0].vendedor_codigo).toBe("V02");
  });

  test("dias_mora = -1 cuando no hay match en cartera ni ventas", async () => {
    const rows = [
      {
        cliente_nit: "999999",
        factura: "99999",
        fecha_abono: "2026-03-01",
      },
    ];

    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) => Promise.resolve(cb({ data: [], error: null }));
      return chain;
    });

    const result = await enrichFromDB(rows);
    expect(result[0].dias_mora).toBe(-1);
    expect(result[0]._sinMatchCartera).toBe(true);
  });

  test("usa fecha de venta como fallback si no hay cartera", async () => {
    const rows = [
      {
        cliente_nit: "900123",
        factura: "77777",
        fecha_abono: "2026-03-10",
      },
    ];

    let fromCallIndex = 0;
    const responses = [
      // clientes
      { data: [], error: null },
      // cartera — vacío
      { data: [], error: null },
      // ventas — tiene match
      {
        data: [
          {
            factura: "FELE-77777",
            vendedor_codigo: "V05",
            fecha: "2026-02-10",
          },
        ],
        error: null,
      },
    ];

    mockFrom.mockImplementation(() => {
      const chain = {};
      ["select", "in", "range", "order"].forEach((m) => {
        chain[m] = vi.fn(() => chain);
      });
      chain.then = (cb) => {
        const res = responses[fromCallIndex] || { data: [], error: null };
        fromCallIndex++;
        return Promise.resolve(cb(res));
      };
      return chain;
    });

    const result = await enrichFromDB(rows);
    // dias desde venta (2026-02-10) hasta pago (2026-03-10) = 28 días
    expect(result[0].dias_mora).toBe(28);
    expect(result[0]._sinMatchCartera).toBe(false);
    expect(result[0].vendedor_codigo).toBe("V05");
  });
});

// ────────────────────────────────────────────────────
// enrichRecaudoExclusions
// ────────────────────────────────────────────────────

/** Helper: mock mockFrom routing responses by table name */
function setupTableMock(tableMap) {
  mockFrom.mockImplementation((table) => {
    const chain = {};
    let capturedTable = table;
    ["select", "in", "range", "order", "eq"].forEach((m) => {
      chain[m] = vi.fn(() => chain);
    });
    chain.then = (cb) => {
      const res = tableMap[capturedTable] || { data: [], error: null };
      return Promise.resolve(cb(res));
    };
    return chain;
  });
}

describe("enrichRecaudoExclusions", () => {
  test("retorna filas sin cambios si no hay facturas", async () => {
    const rows = [{ factura: "", valor_recaudo: 100000 }];
    const result = await enrichRecaudoExclusions(rows);
    expect(result).toEqual(rows);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("agrega _valor_excluido_marca proporcional cuando hay exclusión", async () => {
    const rows = [{ factura: "12345", valor_recaudo: 1000000 }];

    setupTableMock({
      distrimm_comisiones_ventas: {
        data: [
          {
            factura: "FELE-12345",
            producto_codigo: "P001",
            valor_total: 600000,
          },
          {
            factura: "FELE-12345",
            producto_codigo: "P002",
            valor_total: 400000,
          },
        ],
        error: null,
      },
      distrimm_productos_catalogo: {
        data: [
          { codigo: "P001", marca: "MARCA_A" },
          { codigo: "P002", marca: "MARCA_B" },
        ],
        error: null,
      },
      distrimm_comisiones_exclusiones: {
        data: [{ tipo: "marca", valor: "MARCA_A" }],
        error: null,
      },
    });

    const result = await enrichRecaudoExclusions(rows);

    // P001 (MARCA_A) excluida = 600k de 1M total = 60%
    // _valor_excluido_marca = round(0.6 * 1000000) = 600000
    expect(result[0]._valor_excluido_marca).toBe(600000);
    expect(result[0]._valor_iva).toBe(0);
  });

  test("sin exclusiones activas → _valor_excluido_marca = 0", async () => {
    const rows = [{ factura: "99999", valor_recaudo: 500000 }];

    setupTableMock({
      distrimm_comisiones_ventas: {
        data: [
          {
            factura: "FELE-99999",
            producto_codigo: "P001",
            valor_total: 500000,
          },
        ],
        error: null,
      },
      distrimm_productos_catalogo: {
        data: [{ codigo: "P001", marca: "MARCA_X" }],
        error: null,
      },
      distrimm_comisiones_exclusiones: {
        data: [],
        error: null,
      },
    });

    const result = await enrichRecaudoExclusions(rows);
    expect(result[0]._valor_excluido_marca).toBe(0);
    expect(result[0]._valor_iva).toBe(0);
  });

  test("marca _enrichment_failed en error de Supabase", async () => {
    const rows = [{ factura: "12345", valor_recaudo: 100000 }];

    setupTableMock({
      distrimm_comisiones_ventas: {
        data: null,
        error: { message: "DB error" },
      },
    });

    const result = await enrichRecaudoExclusions(rows);
    expect(result[0]._enrichment_failed).toBe(true);
  });
});
