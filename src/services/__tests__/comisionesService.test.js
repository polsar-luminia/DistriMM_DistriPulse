const { mockFrom, mockRpc, mockFetchAllRows } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockFetchAllRows: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
  fetchAllRows: mockFetchAllRows,
}));

import {
  getComisionesCargas,
  deleteComisionesCarga,
  getComisionesVentas,
  getVentasByCargas,
  upsertProductosCatalogo,
  calcularComisiones,
  getExclusiones,
  addExclusion,
  removeExclusion,
  getCargasByMonth,
  buildInputHash,
} from "../comisionesService";

function makeChain(overrides = {}) {
  const chain = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "in",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
    "not",
    "gte",
    "lte",
    "neq",
    "is",
    "upsert",
    "lt",
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  Object.entries(overrides).forEach(([k, v]) => {
    chain[k] = vi.fn(v);
  });
  return chain;
}

describe("getComisionesCargas", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna cargas ordenadas por fecha", async () => {
    const mockData = [{ id: 1, fecha_ventas: "2025-01-15" }];
    const chain = makeChain({
      limit: () => Promise.resolve({ data: mockData, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getComisionesCargas();
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  test("retorna error cuando falla la consulta", async () => {
    const chain = makeChain({
      limit: () =>
        Promise.resolve({ data: null, error: new Error("DB error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getComisionesCargas();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("deleteComisionesCarga", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna success true cuando elimina correctamente", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await deleteComisionesCarga("carga-1");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  test("retorna success false cuando falla la eliminación", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: new Error("Constraint") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await deleteComisionesCarga("carga-1");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("getComisionesVentas", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna ventas usando fetchAllRows", async () => {
    const mockVentas = [{ id: 1, producto: "Prod A", valor: 50000 }];
    mockFetchAllRows.mockResolvedValue(mockVentas);

    const result = await getComisionesVentas("carga-1");
    expect(result.data).toEqual(mockVentas);
    expect(result.error).toBeNull();
    expect(mockFetchAllRows).toHaveBeenCalled();
  });

  test("retorna error cuando fetchAllRows falla", async () => {
    mockFetchAllRows.mockRejectedValue(new Error("Timeout"));

    const result = await getComisionesVentas("carga-1");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("getVentasByCargas", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna array vacío para lista de IDs vacía", async () => {
    const result = await getVentasByCargas([]);
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  test("retorna array vacío para null", async () => {
    const result = await getVentasByCargas(null);
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  test("retorna ventas cuando hay IDs válidos", async () => {
    const mockVentas = [{ id: 1, carga_id: "c1" }];
    mockFetchAllRows.mockResolvedValue(mockVentas);

    const result = await getVentasByCargas(["c1", "c2"]);
    expect(result.data).toEqual(mockVentas);
    expect(result.error).toBeNull();
  });
});

describe("upsertProductosCatalogo", () => {
  beforeEach(() => vi.clearAllMocks());

  test("inserta productos en lotes de máximo 100", async () => {
    const chain = makeChain({
      upsert: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    // 150 productos para probar batching
    const rows = Array.from({ length: 150 }, (_, i) => ({
      codigo: `P${i}`,
      nombre: `Producto ${i}`,
    }));

    const result = await upsertProductosCatalogo(rows);
    expect(result.error).toBeNull();
    // Debe haber llamado from 2 veces (100 + 50)
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  test("retorna error si un batch falla", async () => {
    const chain = makeChain({
      upsert: () => Promise.resolve({ error: new Error("Duplicate") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await upsertProductosCatalogo([
      { codigo: "P1", nombre: "Test" },
    ]);
    expect(result.error).toBeDefined();
  });
});

describe("calcularComisiones", () => {
  beforeEach(() => vi.clearAllMocks());

  test("llama RPC y retorna resultados", async () => {
    const mockResult = [{ vendedor: "V1", total: 500000 }];
    mockRpc.mockResolvedValue({ data: mockResult, error: null });

    const result = await calcularComisiones("carga-1");
    expect(result.data).toEqual(mockResult);
    expect(result.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("fn_calcular_comisiones", {
      p_carga_id: "carga-1",
    });
  });

  test("retorna error cuando RPC falla", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("RPC error") });

    const result = await calcularComisiones("carga-1");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("getExclusiones", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna exclusiones activas", async () => {
    const mockData = [{ id: 1, tipo: "marca", valor: "Marca X", activa: true }];
    const chain = makeChain({
      limit: () => Promise.resolve({ data: mockData, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getExclusiones();
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });
});

describe("addExclusion", () => {
  beforeEach(() => vi.clearAllMocks());

  test("agrega exclusión exitosamente", async () => {
    const mockExclusion = { id: "exc-1", tipo: "marca", valor: "Marca X" };
    const chain = makeChain({
      single: () => Promise.resolve({ data: mockExclusion, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await addExclusion({
      tipo: "marca",
      valor: "Marca X",
      descripcion: "Test",
      motivo: "No aplica",
    });
    expect(result.data).toEqual(mockExclusion);
    expect(result.error).toBeNull();
  });
});

describe("removeExclusion", () => {
  beforeEach(() => vi.clearAllMocks());

  test("desactiva exclusión exitosamente", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await removeExclusion("exc-1");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe("getCargasByMonth", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna cargas del mes especificado", async () => {
    const mockData = [{ id: "c1", fecha_ventas: "2025-03-10" }];
    const chain = makeChain({
      order: () => Promise.resolve({ data: mockData, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getCargasByMonth(2025, 3);
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });
});

describe("buildInputHash", () => {
  const base = {
    cargaIds: ["id-1", "id-2"],
    totalVentas: 100,
    totalRecaudos: 50,
    presupuestosMarca: [
      {
        id: "pm-1",
        meta_ventas: 5000000,
        pct_comision: 3,
        updated_at: "2026-01-15T10:00:00Z",
      },
    ],
    presupuestosRecaudo: [
      {
        id: "pr-1",
        meta_recaudo: 8000000,
        tramo1_min: 0,
        tramo1_max: 89.99,
        tramo1_pct: 0.5,
        tramo2_min: 90,
        tramo2_max: 99.99,
        tramo2_pct: 0.75,
        tramo3_min: 100,
        tramo3_max: 109.99,
        tramo3_pct: 1,
        tramo4_min: 110,
        tramo4_pct: 1.25,
        updated_at: "2026-01-15T10:00:00Z",
      },
    ],
    exclusiones: [{ id: "e1", tipo: "marca", valor: "CONTEGRAL" }],
    catalogo: [
      { codigo: "PROD-001", marca: "CONTEGRAL" },
      { codigo: "PROD-002", marca: "ADAMA" },
    ],
  };

  test("mismo input produce mismo hash (determinista)", () => {
    expect(buildInputHash(base)).toBe(buildInputHash(base));
  });

  test("cambio en exclusiones produce hash diferente", () => {
    const modified = {
      ...base,
      exclusiones: [{ id: "e1", tipo: "marca", valor: "OUROFINO" }],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("agregar exclusion produce hash diferente", () => {
    const modified = {
      ...base,
      exclusiones: [
        ...base.exclusiones,
        { id: "e2", tipo: "producto", valor: "PROD-001" },
      ],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("cambio de marca en catalogo produce hash diferente", () => {
    const modified = {
      ...base,
      catalogo: [
        { codigo: "PROD-001", marca: "OUROFINO" }, // changed brand
        { codigo: "PROD-002", marca: "ADAMA" },
      ],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("agregar producto al catalogo produce hash diferente", () => {
    const modified = {
      ...base,
      catalogo: [...base.catalogo, { codigo: "PROD-003", marca: "EDO" }],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("cambio en cargaIds produce hash diferente", () => {
    const modified = { ...base, cargaIds: ["id-1", "id-3"] };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("orden de cargaIds no afecta el hash", () => {
    const reversed = { ...base, cargaIds: ["id-2", "id-1"] };
    expect(buildInputHash(reversed)).toBe(buildInputHash(base));
  });

  test("exclusiones vacías produce hash válido", () => {
    const empty = { ...base, exclusiones: [], catalogo: [] };
    expect(buildInputHash(empty)).toBeTruthy();
  });

  test("editar meta_ventas de presupuesto marca produce hash diferente", () => {
    const modified = {
      ...base,
      presupuestosMarca: [
        { ...base.presupuestosMarca[0], meta_ventas: 9000000 },
      ],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("editar meta_recaudo de presupuesto recaudo produce hash diferente", () => {
    const modified = {
      ...base,
      presupuestosRecaudo: [
        { ...base.presupuestosRecaudo[0], meta_recaudo: 12000000 },
      ],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("editar un tramo de recaudo produce hash diferente", () => {
    const modified = {
      ...base,
      presupuestosRecaudo: [
        { ...base.presupuestosRecaudo[0], tramo3_pct: 1.5 },
      ],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });

  test("cambio en updated_at de presupuesto produce hash diferente", () => {
    const modified = {
      ...base,
      presupuestosMarca: [
        { ...base.presupuestosMarca[0], updated_at: "2026-03-01T08:00:00Z" },
      ],
    };
    expect(buildInputHash(modified)).not.toBe(buildInputHash(base));
  });
});
