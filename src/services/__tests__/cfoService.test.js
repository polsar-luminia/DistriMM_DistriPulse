const { mockFrom, mockInvoke, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInvoke: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
    rpc: mockRpc,
  },
}));

import {
  triggerCfoAnalysis,
  getCfoAnalyses,
  getHistoricoCartera,
} from "../cfoService";

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
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  Object.entries(overrides).forEach(([k, v]) => {
    chain[k] = vi.fn(v);
  });
  return chain;
}

describe("triggerCfoAnalysis", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna datos del análisis cuando es exitoso", async () => {
    const mockDashboard = { resumen: "Todo bien", indicadores: {} };
    mockInvoke.mockResolvedValue({
      data: { dashboard: mockDashboard },
      error: null,
    });

    const result = await triggerCfoAnalysis({ carga_id: "c1" });
    expect(result.data).toEqual(mockDashboard);
    expect(result.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith(
      "proxy-n8n-cfo",
      expect.objectContaining({ body: { carga_id: "c1" } }),
    );
  });

  test("retorna error cuando falla la invocación", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: new Error("Timeout"),
    });

    const result = await triggerCfoAnalysis({ carga_id: "c1" });
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  test("maneja respuesta sin dashboard usando campo analisis", async () => {
    const mockResult = { analisis: { kpis: {} } };
    mockInvoke.mockResolvedValue({ data: mockResult, error: null });

    const result = await triggerCfoAnalysis({ carga_id: "c1" });
    expect(result.data).toEqual({ kpis: {} });
  });
});

describe("getCfoAnalyses", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna análisis normalizados sin filtro de carga", async () => {
    const mockData = [
      { id: 1, dashboard: { dashboard: { kpi: 1 } }, created_at: "2025-01-01" },
    ];
    const chain = makeChain({
      limit: () => Promise.resolve({ data: mockData, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getCfoAnalyses();
    expect(result.data).toBeDefined();
    expect(result.data[0].analysis).toEqual({ kpi: 1 });
    expect(result.error).toBeNull();
  });

  test("filtra por cargaId cuando se proporciona", async () => {
    const chain = makeChain({
      limit: () => chain,
    });
    // After limit, eq is called for cargaId, then the promise resolves
    chain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
    mockFrom.mockReturnValue(chain);

    await getCfoAnalyses("carga-1");
    expect(chain.eq).toHaveBeenCalledWith("carga_id", "carga-1");
  });

  test("retorna error cuando falla la consulta", async () => {
    const chain = makeChain({
      limit: () =>
        Promise.resolve({ data: null, error: new Error("DB error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getCfoAnalyses();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("getHistoricoCartera", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna datos históricos", async () => {
    const mockData = [{ periodo: "2025-01", total: 1000000 }];
    mockRpc.mockResolvedValue({ data: mockData, error: null });

    const result = await getHistoricoCartera();
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("fn_cfo_historico_cartera");
  });

  test("retorna array vacío para data null", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await getHistoricoCartera();
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  test("retorna error cuando RPC falla", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("RPC error") });

    const result = await getHistoricoCartera();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});
