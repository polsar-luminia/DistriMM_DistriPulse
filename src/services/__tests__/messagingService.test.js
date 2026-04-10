// Declare mocks using vi.hoisted so they're available when vi.mock is hoisted
const { mockFrom, mockInvoke, mockRpc, mockFetchAllRows } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInvoke: vi.fn(),
  mockRpc: vi.fn(),
  mockFetchAllRows: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
    rpc: mockRpc,
  },
  fetchAllRows: mockFetchAllRows,
}));

vi.mock("@/constants", () => ({
  COLOMBIA_OFFSET: -5,
  DAILY_LIMIT: 80,
}));

import {
  getColombiaHour,
  checkSendingHours,
  normalizePhone,
  resolveClientPhone,
  renderTemplate,
  buildInvoiceDetail,
  sendWhatsAppMessage,
  getActiveInstance,
  getMessageLog,
  createLote,
  getClientPhones,
} from "../messagingService";

// Helper: crea un chain de Supabase mock
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
  ];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  Object.entries(overrides).forEach(([k, v]) => {
    chain[k] = vi.fn(v);
  });
  return chain;
}

// ============================================================================
// Funciones puras
// ============================================================================

describe("getColombiaHour", () => {
  afterEach(() => vi.restoreAllMocks());

  test("retorna hora Colombia (UTC-5) para medianoche UTC", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(0);
    expect(getColombiaHour()).toBe(19); // 0 - 5 + 24 = 19
  });

  test("retorna hora Colombia para mediodía UTC", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(12);
    expect(getColombiaHour()).toBe(7); // 12 - 5 = 7
  });

  test("retorna hora Colombia para 5am UTC", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(5);
    expect(getColombiaHour()).toBe(0); // 5 - 5 = 0
  });

  test("retorna hora Colombia para 23 UTC", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(23);
    expect(getColombiaHour()).toBe(18); // 23 - 5 = 18
  });
});

describe("checkSendingHours", () => {
  afterEach(() => vi.restoreAllMocks());

  test("permite envío a las 7am Colombia", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(12); // 12 UTC = 7 COL
    const result = checkSendingHours();
    expect(result.allowed).toBe(true);
    expect(result.hour).toBe(7);
  });

  test("permite envío a las 20:00 Colombia", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(1); // (1 - 5 + 24) % 24 = 20
    const result = checkSendingHours();
    expect(result.allowed).toBe(true);
    expect(result.hour).toBe(20);
  });

  test("bloquea envío a las 21:00 Colombia", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(2); // (2 - 5 + 24) % 24 = 21
    const result = checkSendingHours();
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Fuera de horario");
  });

  test("bloquea envío a las 3am Colombia", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(8); // (8 - 5 + 24) % 24 = 3
    const result = checkSendingHours();
    expect(result.allowed).toBe(false);
  });

  test("bloquea envío a las 6am Colombia", () => {
    vi.spyOn(Date.prototype, "getUTCHours").mockReturnValue(11); // (11 - 5 + 24) % 24 = 6
    const result = checkSendingHours();
    expect(result.allowed).toBe(false);
    expect(result.hour).toBe(6);
  });
});

describe("normalizePhone", () => {
  test("normaliza 10 dígitos con prefijo 3 agregando 57", () => {
    const result = normalizePhone("3101234567");
    expect(result.valid).toBe(true);
    expect(result.phone).toBe("573101234567");
  });

  test("acepta 12 dígitos que empiezan con 57", () => {
    const result = normalizePhone("573101234567");
    expect(result.valid).toBe(true);
    expect(result.phone).toBe("573101234567");
  });

  test("elimina caracteres no numéricos", () => {
    const result = normalizePhone("+57 310-123-4567");
    expect(result.valid).toBe(true);
    expect(result.phone).toBe("573101234567");
  });

  test("retorna inválido para null", () => {
    const result = normalizePhone(null);
    expect(result.valid).toBe(false);
    expect(result.phone).toBeNull();
  });

  test("retorna inválido para cadena vacía", () => {
    const result = normalizePhone("");
    expect(result.valid).toBe(false);
    expect(result.phone).toBeNull();
  });

  test("retorna inválido para 7 dígitos (fijo)", () => {
    const result = normalizePhone("1234567");
    expect(result.valid).toBe(false);
    expect(result.phone).toBeNull();
  });

  test("retorna inválido para 11 dígitos con prefijo 57", () => {
    const result = normalizePhone("57310123456"); // 11 digits
    expect(result.valid).toBe(false);
  });

  test("retorna inválido para 12 dígitos que no empiezan con 573", () => {
    const result = normalizePhone("571234567890");
    expect(result.valid).toBe(false);
    expect(result.phone).toBeNull();
  });
});

describe("resolveClientPhone", () => {
  test("prioriza celular sobre telefono_1", () => {
    const client = { celular: "3101234567", telefono_1: "3209876543" };
    const result = resolveClientPhone(client);
    expect(result.valid).toBe(true);
    expect(result.phone).toBe("573101234567");
    expect(result.source).toBe("celular");
  });

  test("usa telefono_1 si celular no es válido", () => {
    const client = { celular: "1234567", telefono_1: "3209876543" };
    const result = resolveClientPhone(client);
    expect(result.valid).toBe(true);
    expect(result.phone).toBe("573209876543");
    expect(result.source).toBe("telefono_1");
  });

  test("usa telefono si celular y telefono_1 no son válidos", () => {
    const client = {
      celular: null,
      telefono_1: "12345",
      telefono: "3157654321",
    };
    const result = resolveClientPhone(client);
    expect(result.valid).toBe(true);
    expect(result.source).toBe("cartera");
  });

  test("retorna inválido si ningún teléfono es válido", () => {
    const client = { celular: "123", telefono_1: null };
    const result = resolveClientPhone(client);
    expect(result.valid).toBe(false);
    expect(result.source).toBe("ninguno");
  });

  test("maneja cliente undefined", () => {
    const result = resolveClientPhone(undefined);
    expect(result.valid).toBe(false);
  });
});

describe("renderTemplate", () => {
  test("reemplaza variables en plantilla", () => {
    const template = "Hola {{nombre}}, tu saldo es {{saldo}}";
    const result = renderTemplate(template, {
      nombre: "Carlos",
      saldo: "$100.000",
    });
    expect(result).toBe("Hola Carlos, tu saldo es $100.000");
  });

  test("mantiene placeholder si variable no existe", () => {
    const result = renderTemplate("Hola {{nombre}}", {});
    expect(result).toBe("Hola {{nombre}}");
  });

  test("retorna cadena vacía para template null", () => {
    expect(renderTemplate(null)).toBe("");
  });

  test("retorna template sin cambios si no hay placeholders", () => {
    expect(renderTemplate("Hola mundo")).toBe("Hola mundo");
  });
});

describe("buildInvoiceDetail", () => {
  test("formatea lista de facturas correctamente", () => {
    const items = [
      {
        nro_factura: "F001",
        valor_saldo: 1500000,
        fecha_vencimiento: "01/01/2025",
      },
      {
        nro_factura: "F002",
        valor_saldo: 2500000,
        fecha_vencimiento: "15/01/2025",
      },
    ];
    const result = buildInvoiceDetail(items);
    expect(result.detalle_facturas).toContain("F001");
    expect(result.detalle_facturas).toContain("F002");
    expect(result.total).toBeDefined();
  });

  test("retorna texto por defecto para lista vacía", () => {
    const result = buildInvoiceDetail([]);
    expect(result.detalle_facturas).toBe("Sin facturas pendientes.");
  });

  test("maneja facturas sin número usando S/N", () => {
    const items = [{ valor_saldo: 100000 }];
    const result = buildInvoiceDetail(items);
    expect(result.detalle_facturas).toContain("S/N");
  });

  test("suma totales correctamente", () => {
    const items = [
      { nro_factura: "F1", valor_saldo: 1000000 },
      { nro_factura: "F2", valor_saldo: 2000000 },
    ];
    const result = buildInvoiceDetail(items);
    expect(result.total).toContain("3.000.000");
  });
});

// ============================================================================
// Funciones con Supabase (mocked)
// ============================================================================

describe("sendWhatsAppMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  test("envía mensaje exitosamente con instance_id provisto", async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    const result = await sendWhatsAppMessage({
      phone: "573101234567",
      message: "Hola",
      clientName: "Test",
      instance_id: "inst-123",
    });

    expect(result.success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith(
      "proxy-n8n-whatsapp",
      expect.any(Object),
    );
  });

  test("retorna error si no hay instancia activa", async () => {
    const chain = makeChain({
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await sendWhatsAppMessage({
      phone: "573101234567",
      message: "Hola",
      clientName: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No hay instancia");
  });

  test("retorna error cuando falla la invocación", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("Timeout") });
    const chain = makeChain({
      maybeSingle: () =>
        Promise.resolve({ data: { id: "inst-1" }, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await sendWhatsAppMessage({
      phone: "573101234567",
      message: "Hola",
      clientName: "Test",
    });

    expect(result.success).toBe(false);
  });
});

describe("getActiveInstance", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna instancia activa cuando existe", async () => {
    const mockInstance = {
      id: "inst-1",
      phone_number_id: "123",
      phone_display: "+57310",
    };
    const chain = makeChain({
      maybeSingle: () => Promise.resolve({ data: mockInstance, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getActiveInstance();
    expect(result.data).toEqual(mockInstance);
    expect(result.error).toBeNull();
  });

  test("retorna null cuando no hay instancia", async () => {
    const chain = makeChain({
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getActiveInstance();
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});

describe("getMessageLog", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna log de mensajes con filtros de paginación", async () => {
    const mockData = [{ id: 1, tipo: "recordatorio" }];
    const chain = makeChain({
      range: () => Promise.resolve({ data: mockData, count: 1, error: null }),
    });
    mockFrom.mockReturnValue(chain);

    const result = await getMessageLog({
      tipo: "recordatorio",
      offset: 0,
      limit: 10,
    });
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });
});

describe("createLote", () => {
  beforeEach(() => vi.clearAllMocks());

  test("crea lote con destinatarios exitosamente", async () => {
    const mockLote = { id: "lote-1" };
    const mockDetalle = [{ id: "det-1", lote_id: "lote-1" }];

    const loteChain = makeChain({
      single: () => Promise.resolve({ data: mockLote, error: null }),
    });
    const detalleChain = makeChain();
    detalleChain.select = vi.fn(() =>
      Promise.resolve({ data: mockDetalle, error: null }),
    );

    mockFrom.mockReturnValueOnce(loteChain).mockReturnValueOnce(detalleChain);

    const result = await createLote(
      { tipo: "recordatorio", mensaje_plantilla: "Hola {{nombre}}" },
      [
        {
          cliente_nombre: "Test",
          cliente_nit: "123",
          telefono: "573101234567",
          mensaje_personalizado: "Hola Test",
        },
      ],
    );

    expect(result.data).toBeDefined();
    expect(result.error).toBeNull();
  });
});

describe("getClientPhones", () => {
  beforeEach(() => vi.clearAllMocks());

  test("retorna mapa vacío para lista de NITs vacía", async () => {
    const result = await getClientPhones([]);
    expect(result.data).toEqual({});
    expect(result.error).toBeNull();
  });

  test("retorna mapa vacío para null", async () => {
    const result = await getClientPhones(null);
    expect(result.data).toEqual({});
    expect(result.error).toBeNull();
  });
});
