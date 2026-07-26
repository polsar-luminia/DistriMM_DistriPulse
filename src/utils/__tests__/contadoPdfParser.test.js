import { describe, it, expect } from "vitest";
import {
  parseLines,
  validateChecksums,
  groupItemsToLines,
  mergeWrappedLines,
  _internal,
} from "../contadoPdfParser";

const { parseAmount, RE_DOC_HEADER, RE_FP_LINE, RE_RESUMEN_FP } = _internal;

// Helper para fabricar líneas como las que produce groupItemsToLines
const L = (text, page = 1, y = 0) => ({ text, page, y, items: [] });

describe("parseAmount", () => {
  it("parsea formato US (coma=miles, punto=decimal)", () => {
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
    expect(parseAmount("74,000.00")).toBe(74000);
    expect(parseAmount("105,000.00")).toBe(105000);
  });

  it("parsea formato CO (punto=miles, coma=decimal)", () => {
    expect(parseAmount("1.234.567,89")).toBe(1234567.89);
    expect(parseAmount("74.000,00")).toBe(74000);
  });

  it("parsea solo dígitos", () => {
    expect(parseAmount("12345")).toBe(12345);
    expect(parseAmount("123.45")).toBe(123.45);
  });

  it("retorna NaN para basura", () => {
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount(null)).toBeNaN();
  });
});

describe("regex de líneas", () => {
  it("detecta encabezado de documento simple", () => {
    const m =
      "222,222,222 MENORES CUANTIAS 06/04 DV-1 1149 FELE 22615 74,000.00".match(
        RE_DOC_HEADER,
      );
    expect(m).toBeTruthy();
    expect(m[1]).toBe("222,222,222");
    expect(m[2]).toBe("MENORES CUANTIAS");
    expect(m[3]).toBe("06/04");
    expect(m[4]).toBe("DV-1");
    expect(m[6]).toBe("FELE");
    expect(m[7]).toBe("22615");
    expect(m[8]).toBe("74,000.00");
    expect(m[9]).toBeUndefined();
  });

  it("detecta documento anulado", () => {
    const m =
      "1,109,413,795 GUTIERREZ GAVIRIA EDWIN HERNAN 23/04 DV-1 1177 FELE 23110 0.00 Anulado".match(
        RE_DOC_HEADER,
      );
    expect(m).toBeTruthy();
    expect(m[9]).toBe("Anulado");
    expect(m[8]).toBe("0.00");
  });

  it("detecta documento FCI", () => {
    const m = "40,595,650 RESTREPO BOLAÑOS YECENIA 06/04 FV-3 69 FCI 69 1,131,600.00".match(
      RE_DOC_HEADER,
    );
    expect(m).toBeTruthy();
    expect(m[6]).toBe("FCI");
    expect(m[4]).toBe("FV-3");
  });

  it("detecta línea FP con descripción simple", () => {
    const m = "13050501 3 CREDITO CLIENTES 1 222222222 22615 74,000.00".match(
      RE_FP_LINE,
    );
    expect(m).toBeTruthy();
    expect(m[1]).toBe("13050501");
    expect(m[2]).toBe("3");
    expect(m[3]).toBe("CREDITO CLIENTES");
    expect(m[7]).toBe("74,000.00");
  });

  it("detecta línea FP con descripción multi-palabra", () => {
    const m =
      "11100504 13 CONTADO BANCO BBVA 1 222222222 22639 48,000.00".match(
        RE_FP_LINE,
      );
    expect(m).toBeTruthy();
    expect(m[1]).toBe("11100504");
    expect(m[2]).toBe("13");
    expect(m[3]).toBe("CONTADO BANCO BBVA");
  });

  it("detecta línea de resumen por cuenta", () => {
    const m = "13050501 3 CREDITO CLIENTES 1,033,867,803.00".match(
      RE_RESUMEN_FP,
    );
    expect(m).toBeTruthy();
    expect(m[1]).toBe("13050501");
    expect(m[4]).toBe("1,033,867,803.00");
  });
});

describe("groupItemsToLines", () => {
  it("agrupa items con misma Y en una sola línea", () => {
    const items = [
      { str: "Hola", transform: [1, 0, 0, 1, 50, 100] },
      { str: "Mundo", transform: [1, 0, 0, 1, 100, 100.5] },
      { str: "Otra", transform: [1, 0, 0, 1, 50, 80] },
    ];
    const lines = groupItemsToLines(items);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Hola Mundo");
    expect(lines[1].text).toBe("Otra");
  });

  it("ordena items por X dentro de la línea", () => {
    const items = [
      { str: "B", transform: [1, 0, 0, 1, 100, 100] },
      { str: "A", transform: [1, 0, 0, 1, 50, 100] },
    ];
    const lines = groupItemsToLines(items);
    expect(lines[0].text).toBe("A B");
  });

  it("ordena líneas por Y descendente (top→bottom)", () => {
    const items = [
      { str: "abajo", transform: [1, 0, 0, 1, 50, 50] },
      { str: "arriba", transform: [1, 0, 0, 1, 50, 200] },
    ];
    const lines = groupItemsToLines(items);
    expect(lines[0].text).toBe("arriba");
    expect(lines[1].text).toBe("abajo");
  });
});

describe("mergeWrappedLines", () => {
  it("concatena líneas que no inician con patrón conocido", () => {
    const merged = mergeWrappedLines([
      L("11101001 4 CONTADO BANCOLOMBIA"),
      L("EMPRESA 1 901484333 22604 423,600.00"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe(
      "11101001 4 CONTADO BANCOLOMBIA EMPRESA 1 901484333 22604 423,600.00",
    );
  });

  it("no concatena cuando segunda línea es starter (otra cuenta)", () => {
    const merged = mergeWrappedLines([
      L("13050501 3 CREDITO CLIENTES 1 222222222 22615 74,000.00"),
      L("110520 1 MOSTRADOR 1 222222222 22685 52,500.00"),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("parseLines: documento contado puro", () => {
  it("parsea un FV con MOSTRADOR + NEQUI", () => {
    const lines = [
      L("Fecha Desde: 01/04/2026 Hasta : 30/04/2026"),
      L("Ventas"),
      L("222,222,222 MENORES CUANTIAS 06/04 FV-1 22606 FELE 22606 105,000.00"),
      L("Cuenta FP Descripcion de la Forma de Pago Cuota Tercero Documento"),
      L("110520 1 MOSTRADOR 1 222222222 22606 5,000.00"),
      L("11100502 9 NEQUI 1 222222222 22606 100,000.00"),
      L("Totales Documento : 105,000.00"),
      L("Total Ventas : 105,000.00"),
      L("Resumen Forma de Pago Agrupadas"),
      L("Tipo de Documento : Ventas"),
      L("110520 1 MOSTRADOR 5,000.00"),
      L("11100502 9 NEQUI 100,000.00"),
      L("Total Ventas 105,000.00"),
      L("Total Formas de Pago : 105,000.00"),
    ];
    const r = parseLines(lines);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].tipo).toBe("FV");
    expect(r.documentos[0].factura).toBe("22606");
    expect(r.documentos[0].total).toBe(105000);
    expect(r.documentos[0].lineas).toHaveLength(2);
    expect(r.documentos[0].lineas[0].cuenta).toBe("110520");
    expect(r.documentos[0].lineas[1].cuenta).toBe("11100502");
    expect(r.periodoDesde).toBe("2026-04-01");
    expect(r.periodoHasta).toBe("2026-04-30");
    expect(r.resumen.totalVentas).toBe(105000);
  });
});

describe("parseLines: saltos de pagina", () => {
  it("deduplica una linea FP repetida al inicio de la siguiente pagina", () => {
    const lines = [
      L("Fecha Desde: 01/04/2026 Hasta : 30/04/2026", 1),
      L("Ventas", 1),
      L("222,222,222 MENORES CUANTIAS 07/04 FV-1 22648 FELE 22648 250,000.00", 1),
      L("Cuenta FP Descripcion de la Forma de Pago Cuota Tercero Documento Valor Forma Pago", 1),
      L("11100504 13 CONTADO BANCO BBVA 1 222222222 22648 250,000.00", 1),
      L("Identificacion Nombre Cliente Fecha Comprob. No Factura Valor Total Estado", 2),
      L("11100504 13 CONTADO BANCO BBVA 1 222222222 22648 250,000.00", 2),
      L("Totales Documento : 250,000.00", 2),
      L("Total Ventas : 250,000.00", 2),
      L("Total Devoluciones : 0.00", 2),
    ];

    const r = parseLines(lines);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].lineas).toHaveLength(1);
    expect(r.documentos[0]._lineasDuplicadasOmitidas).toBe(1);
    expect(validateChecksums(r).ok).toBe(true);
  });
});

describe("parseLines: documento mixto credito + contado", () => {
  it("parsea un FV con MOSTRADOR + CREDITO", () => {
    const lines = [
      L("Fecha Desde: 01/04/2026 Hasta : 30/04/2026"),
      L("Ventas"),
      L(
        "901,989,453 AGROPECUARIA PIEDEMONTES AMAZONICO-APASAS 28/04 FV-1 23232 FELE 23232 21,087,000.00",
      ),
      L("110520 1 MOSTRADOR 1 901989453 23232 11,000,000.00"),
      L("13050501 3 CREDITO CLIENTES 1 901989453 23232 10,087,000.00"),
      L("Totales Documento : 21,087,000.00"),
      L("Total Ventas : 21,087,000.00"),
    ];
    const r = parseLines(lines);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].lineas).toHaveLength(2);
    const credito = r.documentos[0].lineas.find((l) => l.cuenta === "13050501");
    const mostrador = r.documentos[0].lineas.find(
      (l) => l.cuenta === "110520",
    );
    expect(credito.valor).toBe(10087000);
    expect(mostrador.valor).toBe(11000000);
  });
});

describe("parseLines: devolución contado", () => {
  it("clasifica DV correctamente", () => {
    const lines = [
      L("Fecha Desde: 01/04/2026 Hasta : 30/04/2026"),
      L("Devoluciones"),
      L(
        "17,701,185 CORREA CORREA ESTEBAN DE JESUS 16/04 DV-1 1166 FELE 22902 3,838,000.00",
      ),
      L(
        "11101001 4 CONTADO BANCOLOMBIA EMPRESA 1 17701185 22902 3,838,000.00",
      ),
      L("Totales Documento : 3,838,000.00"),
      L("Total Devoluciones : 3,838,000.00"),
    ];
    const r = parseLines(lines);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].tipo).toBe("DV");
    expect(r.documentos[0].lineas[0].cuenta).toBe("11101001");
    expect(r.documentos[0].lineas[0].descripcion).toBe(
      "CONTADO BANCOLOMBIA EMPRESA",
    );
    expect(r.resumen.totalDevoluciones).toBe(3838000);
  });
});

describe("parseLines: documento anulado", () => {
  it("marca anulado=true y total=0", () => {
    const lines = [
      L("Fecha Desde: 01/04/2026 Hasta : 30/04/2026"),
      L("Devoluciones"),
      L(
        "1,109,413,795 GUTIERREZ GAVIRIA EDWIN HERNAN 23/04 DV-1 1177 FELE 23110 0.00 Anulado",
      ),
      L("13050501 3 CREDITO CLIENTES 1 1109413795 23110 0.00"),
      L("Totales Documento : 0.00"),
    ];
    const r = parseLines(lines);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].anulado).toBe(true);
    expect(r.documentos[0].total).toBe(0);
  });
});

describe("parseLines: nombre de cliente con wrap", () => {
  it("re-une nombre de cliente partido visualmente", () => {
    const lines = [
      L("Fecha Desde: 01/04/2026 Hasta : 30/04/2026"),
      L("Ventas"),
      L("828,000,345 CENTRO COMERCIAL AGROPECUARIO DEL CAQUETA"),
      L("S.A.S 27/04 FV-1 23197 FELE 23197 25,000,000.00"),
      L("13050501 3 CREDITO CLIENTES 1 828000345 23197 25,000,000.00"),
      L("Totales Documento : 25,000,000.00"),
    ];
    const r = parseLines(lines);
    expect(r.documentos).toHaveLength(1);
    expect(r.documentos[0].cliente).toContain(
      "CENTRO COMERCIAL AGROPECUARIO DEL CAQUETA",
    );
    expect(r.documentos[0].cliente).toContain("S.A.S");
    expect(r.documentos[0].factura).toBe("23197");
    expect(r.documentos[0].total).toBe(25000000);
  });
});

describe("validateChecksums", () => {
  it("ok cuando suma documentos coincide con totales", () => {
    const parseResult = {
      documentos: [
        {
          tipo: "FV",
          total: 100,
          totalConfirmado: 100,
          lineas: [{ valor: 100 }],
          anulado: false,
        },
        {
          tipo: "DV",
          total: 50,
          totalConfirmado: 50,
          lineas: [{ valor: 50 }],
          anulado: false,
        },
      ],
      resumen: {
        totalVentas: 100,
        totalDevoluciones: 50,
        porCuentaVentas: {},
        porCuentaDevoluciones: {},
      },
    };
    const r = validateChecksums(parseResult);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("flagrea cuando suma FV no coincide", () => {
    const parseResult = {
      documentos: [
        {
          tipo: "FV",
          total: 100,
          totalConfirmado: 100,
          lineas: [{ valor: 100 }],
          anulado: false,
        },
      ],
      resumen: {
        totalVentas: 999,
        totalDevoluciones: 0,
        porCuentaVentas: {},
        porCuentaDevoluciones: {},
      },
    };
    const r = validateChecksums(parseResult);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.tipo === "totalVentas")).toBe(true);
  });

  it("ignora documentos anulados en suma", () => {
    const parseResult = {
      documentos: [
        {
          tipo: "FV",
          total: 100,
          totalConfirmado: 100,
          lineas: [{ valor: 100 }],
          anulado: false,
        },
        {
          tipo: "FV",
          total: 0,
          totalConfirmado: 0,
          lineas: [{ valor: 0 }],
          anulado: true,
        },
      ],
      resumen: {
        totalVentas: 100,
        totalDevoluciones: 0,
        porCuentaVentas: {},
        porCuentaDevoluciones: {},
      },
    };
    const r = validateChecksums(parseResult);
    expect(r.ok).toBe(true);
    expect(r.documentosAnulados).toBe(1);
  });

  it("flagrea inconsistencia entre lineas FP y total documento", () => {
    const parseResult = {
      documentos: [
        {
          tipo: "FV",
          total: 100,
          totalConfirmado: 100,
          lineas: [{ valor: 50 }, { valor: 30 }], // suma 80, no 100
          anulado: false,
        },
      ],
      resumen: {
        totalVentas: 100,
        totalDevoluciones: 0,
        porCuentaVentas: {},
        porCuentaDevoluciones: {},
      },
    };
    const r = validateChecksums(parseResult);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.tipo === "docsFPInconsistentes")).toBe(true);
  });
});
