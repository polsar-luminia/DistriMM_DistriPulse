vi.mock("../constants", () => ({
  AGING_BUCKETS: [
    { key: "Al Día", min: -Infinity, max: 0, color: "#10B981" },
    { key: "1-30 Días", min: 1, max: 30, color: "#FBBF24" },
    { key: "31-60 Días", min: 31, max: 60, color: "#F59E0B" },
    { key: "61-90 Días", min: 61, max: 90, color: "#EF4444" },
    { key: "+90 Días", min: 91, max: Infinity, color: "#7F1D1D" },
  ],
  THRESHOLDS: {
    HIGH_RISK_DAYS: 30,
    LEGAL_ACTION_DAYS: 90,
    UNRECOVERABLE_DAYS: 360,
    PARETO_PERCENTAGE: 0.8,
    HIGH_RISK_PERCENTAGE: 20,
  },
}));

import {
  preprocessItems,
  calculateKPIs,
  buildClientMap,
  calculatePareto,
  calculateAging,
  calculateProjection,
  buildLists,
  buildRadarData,
  buildTopOldest,
  buildVendedorStats,
} from "../portfolioCalculations";

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

function makeItem(overrides = {}) {
  return {
    documento_id: overrides.documento_id ?? "DOC-001",
    cliente_nombre: overrides.cliente_nombre ?? "Cliente Test",
    valor_saldo: overrides.valor_saldo ?? 100000,
    dias_mora: overrides.dias_mora ?? 0,
    fecha_vencimiento: overrides.fecha_vencimiento ?? daysFromToday(10),
    vendedor_codigo: overrides.vendedor_codigo ?? "V01",
    tercero_nit: overrides.tercero_nit ?? "123456",
    ...overrides,
  };
}

describe("preprocessItems", () => {
  test("item vencido ayer tiene dias_mora=1 y days_until_due=-1", () => {
    const items = [makeItem({ fecha_vencimiento: daysFromToday(-1), dias_mora: 0 })];
    const [result] = preprocessItems(items);
    expect(result.dias_mora).toBe(1);
    expect(result.days_until_due).toBe(-1);
  });

  test("item que vence mañana tiene dias_mora=0 y days_until_due=1", () => {
    const items = [makeItem({ fecha_vencimiento: daysFromToday(1), dias_mora: 0 })];
    const [result] = preprocessItems(items);
    expect(result.dias_mora).toBe(0);
    expect(result.days_until_due).toBe(1);
  });

  test("item que vence hoy tiene dias_mora=0 y days_until_due=0", () => {
    const items = [makeItem({ fecha_vencimiento: daysFromToday(0), dias_mora: 0 })];
    const [result] = preprocessItems(items);
    expect(result.dias_mora).toBe(0);
    expect(result.days_until_due).toBe(0);
  });

  test("item sin fecha_vencimiento tiene dias_mora=0", () => {
    const items = [makeItem({ fecha_vencimiento: null, dias_mora: 50 })];
    const [result] = preprocessItems(items);
    expect(result.dias_mora).toBe(0);
    expect(result.days_until_due).toBe(0);
  });

  test("item con fecha inválida retorna dias_mora=0 (guard contra Invalid Date)", () => {
    const items = [makeItem({ fecha_vencimiento: "not-a-date", dias_mora: 99 })];
    const [result] = preprocessItems(items);
    // new Date("not-a-dateT00:00:00") → Invalid Date → isNaN guard catches it
    expect(result.days_until_due).toBe(0);
    expect(result.dias_mora).toBe(0);
  });
});

describe("calculateKPIs", () => {
  test("retorna totales correctos con mezcla de facturas vencidas y al día", () => {
    const items = [
      makeItem({ valor_saldo: 500000, dias_mora: 0 }),
      makeItem({ valor_saldo: 300000, dias_mora: 15 }),
      makeItem({ valor_saldo: 200000, dias_mora: 45 }),
    ];
    const kpis = calculateKPIs(items);
    expect(kpis.total).toBe(1000000);
    expect(kpis.vencida).toBe(500000);
    expect(kpis.porVencer).toBe(500000);
    expect(kpis.porcentajeVencida).toBeCloseTo(50, 1);
  });

  test("retorna ceros cuando el array está vacío", () => {
    const kpis = calculateKPIs([]);
    expect(kpis.total).toBe(0);
    expect(kpis.vencida).toBe(0);
    expect(kpis.porVencer).toBe(0);
    expect(kpis.porcentajeVencida).toBe(0);
    expect(kpis.unrecoverableTotal).toBe(0);
    expect(kpis.vencidaItems).toEqual([]);
  });

  test("calcula porcentajeVencida como 100 cuando todo está vencido", () => {
    const items = [
      makeItem({ valor_saldo: 100000, dias_mora: 10 }),
      makeItem({ valor_saldo: 200000, dias_mora: 20 }),
    ];
    const kpis = calculateKPIs(items);
    expect(kpis.porcentajeVencida).toBe(100);
    expect(kpis.porVencer).toBe(0);
  });

  test("todas al día produce vencida=0 y porcentajeVencida=0", () => {
    const items = [
      makeItem({ valor_saldo: 400000, dias_mora: 0 }),
      makeItem({ valor_saldo: 600000, dias_mora: 0 }),
    ];
    const kpis = calculateKPIs(items);
    expect(kpis.vencida).toBe(0);
    expect(kpis.porcentajeVencida).toBe(0);
    expect(kpis.porVencer).toBe(1000000);
  });

  test("unrecoverable contabiliza correctamente facturas con mora > 360", () => {
    const items = [
      makeItem({ valor_saldo: 100000, dias_mora: 361 }),
      makeItem({ valor_saldo: 200000, dias_mora: 400 }),
      makeItem({ valor_saldo: 500000, dias_mora: 30 }),
    ];
    const kpis = calculateKPIs(items);
    expect(kpis.unrecoverableTotal).toBe(300000);
  });

  test("redondeo monetario COP sin artefactos de punto flotante", () => {
    const items = [
      makeItem({ valor_saldo: 100000.3, dias_mora: 0 }),
      makeItem({ valor_saldo: 200000.7, dias_mora: 5 }),
    ];
    const kpis = calculateKPIs(items);
    expect(Number.isInteger(kpis.total)).toBe(true);
    expect(Number.isInteger(kpis.vencida)).toBe(true);
    expect(Number.isInteger(kpis.porVencer)).toBe(true);
  });
});

describe("buildClientMap", () => {
  test("agrupa 3 items en 2 clientes con deuda y maxMora correctos", () => {
    const items = [
      makeItem({ cliente_nombre: "Cliente A", valor_saldo: 300000, dias_mora: 10 }),
      makeItem({ cliente_nombre: "Cliente A", valor_saldo: 200000, dias_mora: 30 }),
      makeItem({ cliente_nombre: "Cliente B", valor_saldo: 500000, dias_mora: 5 }),
    ];
    const { sortedClients, uniqueClientsCount } = buildClientMap(items);
    expect(uniqueClientsCount).toBe(2);

    const clientA = sortedClients.find(c => c.name === "Cliente A");
    const clientB = sortedClients.find(c => c.name === "Cliente B");
    expect(clientA.deuda).toBe(500000);
    expect(clientA.maxMora).toBe(30);
    expect(clientB.deuda).toBe(500000);
    expect(clientB.maxMora).toBe(5);
  });

  test("cliente_nombre null se agrupa como 'Cliente Desconocido'", () => {
    const items = [makeItem({ cliente_nombre: null, valor_saldo: 100000 })];
    const { sortedClients } = buildClientMap(items);
    expect(sortedClients[0].name).toBe("Cliente Desconocido");
  });

  test("sortedClients ordenados por deuda descendente", () => {
    const items = [
      makeItem({ cliente_nombre: "Pequeño", valor_saldo: 100000 }),
      makeItem({ cliente_nombre: "Grande", valor_saldo: 900000 }),
      makeItem({ cliente_nombre: "Mediano", valor_saldo: 500000 }),
    ];
    const { sortedClients } = buildClientMap(items);
    expect(sortedClients[0].name).toBe("Grande");
    expect(sortedClients[1].name).toBe("Mediano");
    expect(sortedClients[2].name).toBe("Pequeño");
  });

  test("uniqueClientsCount es correcto", () => {
    const items = [
      makeItem({ cliente_nombre: "A" }),
      makeItem({ cliente_nombre: "B" }),
      makeItem({ cliente_nombre: "A" }),
      makeItem({ cliente_nombre: "C" }),
    ];
    const { uniqueClientsCount } = buildClientMap(items);
    expect(uniqueClientsCount).toBe(3);
  });
});

describe("calculatePareto", () => {
  test("1 cliente con 100% de la deuda retorna 100%", () => {
    const clients = [{ deuda: 1000000, name: "Único" }];
    const result = calculatePareto(clients, 1000000, 1);
    expect(result).toBe(100);
  });

  test("10 clientes iguales → 80% (8 de 10)", () => {
    const clients = Array.from({ length: 10 }, (_, i) => ({
      deuda: 100000,
      name: `Cliente ${i}`,
    }));
    const result = calculatePareto(clients, 1000000, 10);
    expect(result).toBe(80);
  });

  test("sin clientes retorna 0", () => {
    const result = calculatePareto([], 0, 0);
    expect(result).toBe(0);
  });

  test("alta concentración (1 cliente = 90% deuda) retorna bajo %", () => {
    const clients = [
      { deuda: 900000, name: "Gigante" },
      { deuda: 50000, name: "Pequeño 1" },
      { deuda: 50000, name: "Pequeño 2" },
    ];
    // 1 client out of 3 already covers 90% > 80%
    const result = calculatePareto(clients, 1000000, 3);
    expect(result).toBeCloseTo(33.33, 1);
  });
});

describe("calculateAging", () => {
  test("distribuye items en cada bucket correctamente", () => {
    const items = [
      makeItem({ dias_mora: 0, valor_saldo: 100000 }),   // Al Día
      makeItem({ dias_mora: 15, valor_saldo: 200000 }),  // 1-30
      makeItem({ dias_mora: 45, valor_saldo: 300000 }),  // 31-60
      makeItem({ dias_mora: 75, valor_saldo: 400000 }),  // 61-90
      makeItem({ dias_mora: 120, valor_saldo: 500000 }), // +90
    ];
    const aging = calculateAging(items);
    expect(aging.find(a => a.name === "Al Día").value).toBe(100000);
    expect(aging.find(a => a.name === "1-30 Días").value).toBe(200000);
    expect(aging.find(a => a.name === "31-60 Días").value).toBe(300000);
    expect(aging.find(a => a.name === "61-90 Días").value).toBe(400000);
    expect(aging.find(a => a.name === "+90 Días").value).toBe(500000);
  });

  test("porcentajes suman 100", () => {
    const items = [
      makeItem({ dias_mora: 0, valor_saldo: 250000 }),
      makeItem({ dias_mora: 10, valor_saldo: 250000 }),
      makeItem({ dias_mora: 50, valor_saldo: 250000 }),
      makeItem({ dias_mora: 100, valor_saldo: 250000 }),
    ];
    const aging = calculateAging(items);
    const totalPercent = aging.reduce((sum, a) => sum + a.percent, 0);
    expect(totalPercent).toBeCloseTo(100, 0);
  });

  test("todo al día → Al Día=100%", () => {
    const items = [
      makeItem({ dias_mora: 0, valor_saldo: 500000 }),
      makeItem({ dias_mora: 0, valor_saldo: 500000 }),
    ];
    const aging = calculateAging(items);
    expect(aging.find(a => a.name === "Al Día").percent).toBe(100);
    expect(aging.find(a => a.name === "1-30 Días").percent).toBe(0);
  });

  test("array vacío produce todos ceros", () => {
    const aging = calculateAging([]);
    aging.forEach(a => {
      expect(a.value).toBe(0);
      expect(a.percent).toBe(0);
    });
  });
});

describe("calculateProjection", () => {
  test("item que vence en 15 días se incluye", () => {
    const items = [makeItem({ dias_mora: 0, fecha_vencimiento: daysFromToday(15), valor_saldo: 100000 })];
    const proj = calculateProjection(items);
    expect(proj.length).toBe(1);
    expect(proj[0].total).toBe(100000);
  });

  test("item que vence en 45 días se excluye", () => {
    const items = [makeItem({ dias_mora: 0, fecha_vencimiento: daysFromToday(45), valor_saldo: 100000 })];
    const proj = calculateProjection(items);
    expect(proj.length).toBe(0);
  });

  test("item vencido se excluye", () => {
    const items = [makeItem({ dias_mora: 10, fecha_vencimiento: daysFromToday(-10), valor_saldo: 100000 })];
    const proj = calculateProjection(items);
    expect(proj.length).toBe(0);
  });

  test("items en la misma fecha se agregan", () => {
    const date = daysFromToday(5);
    const items = [
      makeItem({ dias_mora: 0, fecha_vencimiento: date, valor_saldo: 100000 }),
      makeItem({ dias_mora: 0, fecha_vencimiento: date, valor_saldo: 200000 }),
    ];
    const proj = calculateProjection(items);
    expect(proj.length).toBe(1);
    expect(proj[0].total).toBe(300000);
  });
});

describe("buildLists", () => {
  test("cliente con 100 días mora aparece en urgentItems con 'Cobro Jurídico'", () => {
    const items = [makeItem({ cliente_nombre: "Moroso", valor_saldo: 500000, dias_mora: 100 })];
    const { clientMap } = buildClientMap(items);
    const { urgentItems } = buildLists(items, clientMap);
    expect(urgentItems.length).toBe(1);
    expect(urgentItems[0].reason).toBe("Cobro Jurídico");
    expect(urgentItems[0].name).toBe("Moroso");
  });

  test("cliente con 50 días mora aparece en urgentItems con 'Riesgo Alto'", () => {
    const items = [makeItem({ cliente_nombre: "Riesgoso", valor_saldo: 300000, dias_mora: 50 })];
    const { clientMap } = buildClientMap(items);
    const { urgentItems } = buildLists(items, clientMap);
    expect(urgentItems.length).toBe(1);
    expect(urgentItems[0].reason).toBe("Riesgo Alto");
  });

  test("máximo 3 items urgentes", () => {
    const items = [
      makeItem({ cliente_nombre: "A", valor_saldo: 100000, dias_mora: 50 }),
      makeItem({ cliente_nombre: "B", valor_saldo: 100000, dias_mora: 60 }),
      makeItem({ cliente_nombre: "C", valor_saldo: 100000, dias_mora: 70 }),
      makeItem({ cliente_nombre: "D", valor_saldo: 100000, dias_mora: 80 }),
      makeItem({ cliente_nombre: "E", valor_saldo: 100000, dias_mora: 90 }),
    ];
    const { clientMap } = buildClientMap(items);
    const { urgentItems } = buildLists(items, clientMap);
    expect(urgentItems.length).toBe(3);
  });
});

describe("buildRadarData", () => {
  test("3 clientes vencidos generan 3 puntos de radar", () => {
    const sortedClients = [
      { name: "A", shortName: "A", deuda: 500000, maxMora: 30 },
      { name: "B", shortName: "B", deuda: 300000, maxMora: 20 },
      { name: "C", shortName: "C", deuda: 100000, maxMora: 10 },
    ];
    const radar = buildRadarData(sortedClients);
    expect(radar.length).toBe(3);
  });

  test("normalizado a escala 0-100", () => {
    const sortedClients = [
      { name: "A", shortName: "A", deuda: 1000000, maxMora: 90 },
      { name: "B", shortName: "B", deuda: 500000, maxMora: 45 },
    ];
    const radar = buildRadarData(sortedClients);
    // Largest debt/mora should be 100
    expect(radar[0].Deuda).toBe(100);
    expect(radar[0].Mora).toBe(100);
    // Second should be proportional
    expect(radar[1].Deuda).toBe(50);
    expect(radar[1].Mora).toBe(50);
  });

  test("sin clientes vencidos retorna array vacío", () => {
    const sortedClients = [
      { name: "A", shortName: "A", deuda: 500000, maxMora: 0 },
      { name: "B", shortName: "B", deuda: 300000, maxMora: 0 },
    ];
    const radar = buildRadarData(sortedClients);
    expect(radar).toEqual([]);
  });
});

describe("buildTopOldest", () => {
  test("15 items retorna solo 10", () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      makeItem({ documento_id: `DOC-${i}`, dias_mora: i + 1, valor_saldo: 100000 })
    );
    const top = buildTopOldest(items);
    expect(top.length).toBe(10);
  });

  test("ordenado por dias_mora descendente", () => {
    const items = [
      makeItem({ documento_id: "D1", dias_mora: 10 }),
      makeItem({ documento_id: "D2", dias_mora: 100 }),
      makeItem({ documento_id: "D3", dias_mora: 50 }),
    ];
    const top = buildTopOldest(items);
    expect(top[0].dias_mora).toBe(100);
    expect(top[1].dias_mora).toBe(50);
    expect(top[2].dias_mora).toBe(10);
  });

  test("cliente_nombre null se muestra como 'Cliente Desconocido' (truncado a 15 chars)", () => {
    const items = [makeItem({ cliente_nombre: null, dias_mora: 200 })];
    const top = buildTopOldest(items);
    // "Cliente Desconocido" is 20 chars > 15, so truncated to "Cliente Descono..."
    expect(top[0].shortName).toBe("Cliente Descono...");
  });
});

describe("buildVendedorStats", () => {
  test("2 vendedores con múltiples items producen totales correctos", () => {
    const items = [
      makeItem({ vendedor_codigo: "V01", valor_saldo: 500000, dias_mora: 0, cliente_nombre: "C1" }),
      makeItem({ vendedor_codigo: "V01", valor_saldo: 300000, dias_mora: 10, cliente_nombre: "C2" }),
      makeItem({ vendedor_codigo: "V02", valor_saldo: 200000, dias_mora: 5, cliente_nombre: "C3" }),
    ];
    const { vendedorStats } = buildVendedorStats(items);
    const v01 = vendedorStats.find(v => v.codigo === "V01");
    const v02 = vendedorStats.find(v => v.codigo === "V02");

    expect(v01.totalCartera).toBe(800000);
    expect(v01.totalVencida).toBe(300000);
    expect(v01.facturas).toBe(2);
    expect(v01.clientesCount).toBe(2);

    expect(v02.totalCartera).toBe(200000);
    expect(v02.totalVencida).toBe(200000);
    expect(v02.facturas).toBe(1);
  });

  test("pctVencida se calcula correctamente", () => {
    const items = [
      makeItem({ vendedor_codigo: "V01", valor_saldo: 400000, dias_mora: 0 }),
      makeItem({ vendedor_codigo: "V01", valor_saldo: 600000, dias_mora: 10 }),
    ];
    const { vendedorStats } = buildVendedorStats(items);
    const v01 = vendedorStats[0];
    expect(v01.pctVencida).toBe(60);
  });

  test("uniqueVendedores lista correcta", () => {
    const items = [
      makeItem({ vendedor_codigo: "V01" }),
      makeItem({ vendedor_codigo: "V02" }),
      makeItem({ vendedor_codigo: "V01" }),
    ];
    const { uniqueVendedores } = buildVendedorStats(items);
    expect(uniqueVendedores.sort()).toEqual(["V01", "V02"]);
  });

  test("vendedor_codigo null se agrupa como 'Sin Asignar'", () => {
    const items = [makeItem({ vendedor_codigo: null, valor_saldo: 100000 })];
    const { vendedorStats } = buildVendedorStats(items);
    expect(vendedorStats[0].codigo).toBe("Sin Asignar");
  });
});
