import { describe, test, expect } from "vitest";
import {
  col,
  isRCFormat,
  isCxCFormat,
  parseExcelDate,
  transformCxC,
  transformRC,
  calcularIvaFactura,
  CUENTA_CXC,
} from "../recaudoUpload";

describe("col", () => {
  test("encuentra key exacto", () => {
    expect(col({ Nombre: "abc" }, "Nombre")).toBe("abc");
  });
  test("encuentra key con espacios (trimmed)", () => {
    expect(col({ " Nombre ": "abc" }, "Nombre")).toBe("abc");
  });
  test("retorna undefined si no existe", () => {
    expect(col({ Otro: 1 }, "Nombre")).toBeUndefined();
  });
});

describe("isRCFormat", () => {
  test("detecta formato RC con 4+ marcadores", () => {
    const data = [
      {
        Doc_Oficina: 1,
        Tipo: "RC",
        Comprobante: 1,
        Mov_Cuenta: "13050501",
        Creditos: 100,
      },
    ];
    expect(isRCFormat(data)).toBe(true);
  });
  test("rechaza con menos de 4 marcadores", () => {
    const data = [{ Tipo: "RC", Comprobante: 1, Creditos: 100 }];
    expect(isRCFormat(data)).toBe(false);
  });
  test("rechaza array vacío", () => {
    expect(isRCFormat([])).toBe(false);
  });
});

describe("isCxCFormat", () => {
  test("detecta formato CxC con 4+ marcadores", () => {
    const data = [
      {
        "Fec. Abono": "01/03/2026",
        "Doc. CxC": 123,
        Base: 100,
        Vendedor: 1,
        "Fec. CxC": "01/01/2026",
      },
    ];
    expect(isCxCFormat(data)).toBe(true);
  });
  test("rechaza formato RC", () => {
    const data = [
      { Doc_Oficina: 1, Tipo: "RC", Comprobante: 1, Mov_Cuenta: "13050501" },
    ];
    expect(isCxCFormat(data)).toBe(false);
  });
});

describe("parseExcelDate", () => {
  test("null retorna null", () => {
    expect(parseExcelDate(null)).toBeNull();
  });
  test("vacío retorna null", () => {
    expect(parseExcelDate("")).toBeNull();
  });
  test("serial Excel se convierte a ISO", () => {
    const result = parseExcelDate(46113);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test("formato dd/MM/yyyy se convierte a ISO", () => {
    expect(parseExcelDate("15/03/2026")).toBe("2026-03-15");
  });
  test("formato ISO se retorna tal cual", () => {
    expect(parseExcelDate("2026-03-15")).toBe("2026-03-15");
  });
  test("texto inválido retorna null", () => {
    expect(parseExcelDate("abc")).toBeNull();
  });
  test("undefined retorna null", () => {
    expect(parseExcelDate(undefined)).toBeNull();
  });
});

describe("transformCxC", () => {
  test("filtra por cuenta CxC y mapea campos", () => {
    const data = [
      {
        Cuenta: "13050501",
        "Fec. Abono": "01/03/2026",
        Cliente: "123",
        "Nombre Cliente": "Juan",
        "Doc. CxC": "20366",
        Vendedor: "14",
        Base: 800000,
        Días: 54,
      },
      { Cuenta: "99999999", "Fec. Abono": "01/03/2026", Base: 500000 },
    ];
    const result = transformCxC(data);
    expect(result).toHaveLength(1);
    expect(result[0].cliente_nit).toBe("123");
    expect(result[0].valor_recaudo).toBe(800000);
    expect(result[0].dias_mora).toBe(54);
  });
  test("descarta filas con valor 0", () => {
    const data = [{ Cuenta: "13050501", Base: 0 }];
    expect(transformCxC(data)).toHaveLength(0);
  });
  test("array vacio retorna array vacio", () => {
    expect(transformCxC([])).toHaveLength(0);
  });
  test("Base como string se parsea correctamente", () => {
    const data = [
      {
        Cuenta: "13050501",
        "Fec. Abono": "01/03/2026",
        Base: "500000",
        Días: "30",
        Cliente: "123",
        "Doc. CxC": "20366",
      },
    ];
    const result = transformCxC(data);
    expect(result[0].valor_recaudo).toBe(500000);
  });
  test("dias negativos se clampean a 0", () => {
    const data = [
      {
        Cuenta: "13050501",
        Base: 100000,
        Días: "-5",
        Cliente: "123",
        "Doc. CxC": "20366",
      },
    ];
    const result = transformCxC(data);
    expect(result[0].dias_mora).toBe(0);
  });
});

describe("transformRC", () => {
  test("filtra por cuenta CxC y crédito > 0", () => {
    const data = [
      {
        Mov_Cuenta: "13050501",
        Creditos: 500000,
        Fecha: "01/03/2026",
        Mov_Tercero: "123",
        Mov_DocDetalle: "20366",
        Tipo: "RC",
        Comprobante: "655",
      },
      { Mov_Cuenta: "13050501", Creditos: 0 },
      { Mov_Cuenta: "99999999", Creditos: 100000 },
    ];
    const result = transformRC(data);
    expect(result).toHaveLength(1);
    expect(result[0].cliente_nit).toBe("123");
    expect(result[0].valor_recaudo).toBe(500000);
  });
  test("excluye filas anuladas", () => {
    const data = [{ Mov_Cuenta: "13050501", Creditos: 100000, Anulado: "Sí" }];
    expect(transformRC(data)).toHaveLength(0);
  });
  test("array vacio retorna array vacio", () => {
    expect(transformRC([])).toHaveLength(0);
  });
  test("excluye anulado 'si' sin tilde", () => {
    const data = [{ Mov_Cuenta: "13050501", Creditos: 100000, Anulado: "si" }];
    expect(transformRC(data)).toHaveLength(0);
  });
});

describe("calcularIvaFactura", () => {
  test("todo exento retorna 0", () => {
    const productos = [{ codigo: "P1", costo: 100000 }];
    const map = { P1: 0 };
    expect(calcularIvaFactura(productos, 200000, map)).toBe(0);
  });

  test("todo al 19% calcula IVA correcto", () => {
    const productos = [{ codigo: "P1", costo: 100000 }];
    const map = { P1: 19 };
    // IVA = 200000 * 1.0 * 0.19 / 1.19 = 31933
    expect(calcularIvaFactura(productos, 200000, map)).toBe(31933);
  });

  test("todo al 5% calcula IVA correcto", () => {
    const productos = [{ codigo: "P1", costo: 100000 }];
    const map = { P1: 5 };
    // IVA = 200000 * 1.0 * 0.05 / 1.05 = 9524
    expect(calcularIvaFactura(productos, 200000, map)).toBe(9524);
  });

  test("mixto 50/50 exento + 19%", () => {
    const productos = [
      { codigo: "P1", costo: 50000 },
      { codigo: "P2", costo: 50000 },
    ];
    const map = { P1: 0, P2: 19 };
    // peso19 = 0.5, IVA = 200000 * 0.5 * 0.19 / 1.19 = 15966
    expect(calcularIvaFactura(productos, 200000, map)).toBe(15966);
  });

  test("costoTotal = 0 retorna 0", () => {
    expect(calcularIvaFactura([], 200000, {})).toBe(0);
  });

  test("producto sin catálogo se asume exento", () => {
    const productos = [{ codigo: "DESCONOCIDO", costo: 100000 }];
    expect(calcularIvaFactura(productos, 200000, {})).toBe(0);
  });

  test("mixto 5% + 19% calcula ambos componentes", () => {
    const productos = [
      { codigo: "P1", costo: 50000 },
      { codigo: "P2", costo: 50000 },
    ];
    const map = { P1: 5, P2: 19 };
    // peso5 = 0.5, peso19 = 0.5
    // iva5 = 200000 * 0.5 * 0.05 / 1.05 = 4762
    // iva19 = 200000 * 0.5 * 0.19 / 1.19 = 15966
    // total = 4762 + 15966 = 20728
    expect(calcularIvaFactura(productos, 200000, map)).toBe(20728);
  });
});
