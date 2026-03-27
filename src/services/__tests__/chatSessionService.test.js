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
  getChatSessions,
  createChatSession,
  updateChatSessionTitle,
  deleteChatSession,
  getChatMessages,
  saveChatMessage,
  searchChatSessions,
} from "../chatSessionService";

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
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  Object.entries(overrides).forEach(([k, v]) => {
    chain[k] = vi.fn(v);
  });
  return chain;
}

describe("getChatSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna sesiones ordenadas por último mensaje", async () => {
    const mockData = [
      { id: 1, title: "Sesion 1", last_message_at: "2025-03-01" },
    ];
    const chain = makeChain({
      limit: () => Promise.resolve({ data: mockData, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getChatSessions("user-1");
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  test("retorna error cuando falla la consulta", async () => {
    const chain = makeChain({
      limit: () => Promise.resolve({ data: null, error: new Error("Error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getChatSessions("user-1");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("createChatSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("crea sesión exitosamente", async () => {
    const mockSession = {
      id: "s1",
      user_id: "u1",
      session_id: "sid-1",
      title: "Nueva conversacion",
    };
    const chain = makeChain({
      single: () => Promise.resolve({ data: mockSession, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await createChatSession("u1", "sid-1");
    expect(result.data).toEqual(mockSession);
    expect(result.error).toBeNull();
  });

  test("retorna error cuando falla la creación", async () => {
    const chain = makeChain({
      single: () =>
        Promise.resolve({ data: null, error: new Error("Duplicate") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await createChatSession("u1", "sid-1");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("updateChatSessionTitle", () => {
  beforeEach(() => vi.clearAllMocks());

  test("actualiza título exitosamente", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await updateChatSessionTitle("sid-1", "Nuevo título");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe("deleteChatSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("elimina sesión exitosamente", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await deleteChatSession("sid-1");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  test("retorna error cuando falla la eliminación", async () => {
    const chain = makeChain({
      eq: () => Promise.resolve({ error: new Error("Not found") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await deleteChatSession("sid-1");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("getChatMessages", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna mensajes usando fetchAllRows", async () => {
    const mockMessages = [
      { id: 1, role: "user", content: "Hola" },
      { id: 2, role: "assistant", content: "¿En qué te ayudo?" },
    ];
    mockFetchAllRows.mockResolvedValue(mockMessages);

    const result = await getChatMessages("session-1");
    expect(result.data).toEqual(mockMessages);
    expect(result.error).toBeNull();
    expect(mockFetchAllRows).toHaveBeenCalled();
  });

  test("retorna error cuando fetchAllRows falla", async () => {
    mockFetchAllRows.mockRejectedValue(new Error("Timeout"));

    const result = await getChatMessages("session-1");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("saveChatMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  test("guarda mensaje exitosamente", async () => {
    const mockMsg = {
      id: "m1",
      role: "user",
      content: "Hola",
      is_error: false,
    };
    const chain = makeChain({
      single: () => Promise.resolve({ data: mockMsg, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await saveChatMessage("session-1", "user", "Hola");
    expect(result.data).toEqual(mockMsg);
    expect(result.error).toBeNull();
  });

  test("guarda mensaje de error con flag is_error", async () => {
    const mockMsg = {
      id: "m2",
      role: "assistant",
      content: "Error",
      is_error: true,
    };
    const chain = makeChain({
      single: () => Promise.resolve({ data: mockMsg, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await saveChatMessage(
      "session-1",
      "assistant",
      "Error",
      true,
    );
    expect(result.data.is_error).toBe(true);
  });

  test("retorna error cuando falla el insert", async () => {
    const chain = makeChain({
      single: () =>
        Promise.resolve({ data: null, error: new Error("DB error") }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await saveChatMessage("session-1", "user", "Hola");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("searchChatSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  test("busca sesiones usando RPC", async () => {
    const mockResults = [{ id: 1, title: "Cartera" }];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const result = await searchChatSessions("user-1", "cartera");
    expect(result.data).toEqual(mockResults);
    expect(result.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("search_chat_sessions", {
      p_user_id: "user-1",
      p_query: "cartera",
    });
  });

  test("retorna error cuando RPC falla", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("RPC error") });

    const result = await searchChatSessions("user-1", "cartera");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});
