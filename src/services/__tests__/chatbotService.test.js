const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: mockInvoke },
  },
}));

// Mock sessionStorage
const store = {};
vi.stubGlobal("sessionStorage", {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, val) => {
    store[key] = val;
  }),
  removeItem: vi.fn((key) => {
    delete store[key];
  }),
});

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: vi.fn(() => "mock-uuid-1234-5678-abcd"),
});

import {
  generateSessionId,
  getOrCreateSessionId,
  resetSession,
  sendChatMessage,
  clearChatMemory,
  getSuggestedQuestions,
} from "../chatbotService";

describe("generateSessionId", () => {
  test("retorna un string tipo UUID", () => {
    const id = generateSessionId();
    expect(typeof id).toBe("string");
    expect(id).toBe("mock-uuid-1234-5678-abcd");
  });
});

describe("getOrCreateSessionId", () => {
  beforeEach(() => {
    Object.keys(store).forEach((key) => delete store[key]);
    vi.clearAllMocks();
  });

  test("crea nuevo sessionId si no existe en storage", () => {
    const id = getOrCreateSessionId();
    expect(id).toBe("mock-uuid-1234-5678-abcd");
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "distribot_session_id",
      "mock-uuid-1234-5678-abcd",
    );
  });

  test("retorna sessionId existente del storage", () => {
    store["distribot_session_id"] = "existing-session-id";
    const id = getOrCreateSessionId();
    expect(id).toBe("existing-session-id");
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("resetSession", () => {
  beforeEach(() => {
    Object.keys(store).forEach((key) => delete store[key]);
    vi.clearAllMocks();
  });

  test("genera nuevo sessionId y lo guarda", () => {
    store["distribot_session_id"] = "old-session";
    const newId = resetSession();
    expect(newId).toBe("mock-uuid-1234-5678-abcd");
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "distribot_session_id",
      "mock-uuid-1234-5678-abcd",
    );
  });
});

describe("sendChatMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna respuesta exitosa del bot", async () => {
    mockInvoke.mockResolvedValue({
      data: { output: "Aquí está el resumen de cartera..." },
      error: null,
    });

    const result = await sendChatMessage("session-1", "Dame un resumen");
    expect(result.data).toBe("Aquí está el resumen de cartera...");
    expect(result.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith("proxy-n8n-chatbot", {
      body: {
        action: "sendMessage",
        sessionId: "session-1",
        chatInput: "Dame un resumen",
      },
    });
  });

  test("maneja respuesta vacía con mensaje por defecto", async () => {
    mockInvoke.mockResolvedValue({
      data: { output: "" },
      error: null,
    });

    const result = await sendChatMessage("session-1", "Pregunta");
    expect(result.data).toContain("Lo siento");
    expect(result.error).toBeNull();
  });

  test("maneja respuesta null con mensaje por defecto", async () => {
    mockInvoke.mockResolvedValue({
      data: {},
      error: null,
    });

    const result = await sendChatMessage("session-1", "Pregunta");
    expect(result.data).toContain("Lo siento");
  });

  test("retorna error cuando falla la invocación", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: new Error("Edge Function timeout"),
    });

    const result = await sendChatMessage("session-1", "Pregunta");
    expect(result.data).toBeNull();
    expect(result.error).toContain("No se pudo conectar");
  });

  test("retorna error cuando la promesa es rechazada", async () => {
    mockInvoke.mockRejectedValue(new Error("Network error"));

    const result = await sendChatMessage("session-1", "Pregunta");
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe("clearChatMemory", () => {
  test("retorna success true siempre (no-op)", async () => {
    const result = await clearChatMemory("session-1");
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe("getSuggestedQuestions", () => {
  test("retorna array de preguntas sugeridas", () => {
    const questions = getSuggestedQuestions();
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]).toHaveProperty("label");
    expect(questions[0]).toHaveProperty("message");
  });
});
