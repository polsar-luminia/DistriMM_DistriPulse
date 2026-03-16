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
  getLoads,
  deleteLoad,
  getPortfolioItems,
  testConnection,
  rollbackUpload,
  markRemindersAsSent,
  getClientCreditScore,
  getInvoicesByIds,
} from "../portfolioService";

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
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  Object.entries(overrides).forEach(([k, v]) => {
    chain[k] = vi.fn(v);
  });
  return chain;
}

describe("getLoads", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna lista de cargas ordenadas", async () => {
    const mockData = [{ id: 1, fecha_corte: "2025-01-01" }];
    const chain = makeChain({
      order: () => Promise.resolve({ data: mockData, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getLoads();
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  test("retorna error cuando falla la consulta", async () => {
    const chain = makeChain({
      order: () =>
        Promise.resolve({ data: null, error: new Error("DB error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getLoads();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("deleteLoad", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna success true cuando elimina correctamente", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await deleteLoad("load-123");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  test("retorna success false cuando falla la eliminación", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: new Error("FK constraint") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await deleteLoad("load-123");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("getPortfolioItems", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna items usando fetchAllRows", async () => {
    const mockItems = [{ id: 1, valor_saldo: 1000000 }];
    mockFetchAllRows.mockResolvedValue(mockItems);

    const result = await getPortfolioItems("load-1");
    expect(result.data).toEqual(mockItems);
    expect(result.error).toBeNull();
    expect(mockFetchAllRows).toHaveBeenCalled();
  });

  test("retorna error cuando fetchAllRows falla", async () => {
    mockFetchAllRows.mockRejectedValue(new Error("Timeout"));

    const result = await getPortfolioItems("load-1");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("testConnection", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna connected true cuando la conexión es exitosa", async () => {
    const chain = makeChain({
      select: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await testConnection();
    expect(result.connected).toBe(true);
    expect(result.error).toBeNull();
  });

  test("retorna connected false cuando falla la conexión", async () => {
    const chain = makeChain({
      select: () => Promise.resolve({ error: new Error("Network error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await testConnection();
    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("rollbackUpload", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna success true cuando rollback es exitoso", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await rollbackUpload("load-1");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  test("retorna success false cuando falla el rollback", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: new Error("Error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await rollbackUpload("load-1");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("markRemindersAsSent", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna error si no se proporcionan IDs vacíos", async () => {
    const result = await markRemindersAsSent([]);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("retorna error si IDs es null", async () => {
    const result = await markRemindersAsSent(null);
    expect(result.success).toBe(false);
  });

  test("retorna success y timestamp cuando actualiza correctamente", async () => {
    const chain = makeChain({
      in: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await markRemindersAsSent(["inv-1", "inv-2"]);
    expect(result.success).toBe(true);
    expect(result.timestamp).toBeDefined();
  });
});

describe("getClientCreditScore", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna error si NIT es vacío", async () => {
    const result = await getClientCreditScore(null);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  test("retorna score cuando RPC es exitoso", async () => {
    const mockScore = { score: 85, nivel: "Bueno" };
    mockRpc.mockResolvedValue({ data: mockScore, error: null });

    const result = await getClientCreditScore("900123456");
    expect(result.data).toEqual(mockScore);
    expect(result.error).toBeNull();
  });
});

describe("getInvoicesByIds", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna array vacío para lista vacía", async () => {
    const result = await getInvoicesByIds([]);
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  test("retorna array vacío para null", async () => {
    const result = await getInvoicesByIds(null);
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });
});
