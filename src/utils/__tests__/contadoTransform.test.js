import { describe, it, expect } from "vitest";
import {
  transformDocumento,
  transformContadoDocs,
  resumenPorFormaDePago,
  statsContado,
  applyContadoCommissionRules,
  getContadoBlockingIssues,
} from "../contadoTransform";

const docContadoPuro = () => ({
  tipo: "FV",
  tipoComprobante: "FV-1",
  nit: "222222222",
  cliente: "MENORES CUANTIAS",
  fechaCorta: "06/04",
  fecha: "2026-04-06",
  numeroComprobante: "22606",
  prefijo: "FELE",
  factura: "22606",
  total: 105000,
  anulado: false,
  lineas: [
    {
      cuenta: "110520",
      fp: 1,
      descripcion: "MOSTRADOR",
      valor: 5000,
    },
    {
      cuenta: "11100502",
      fp: 9,
      descripcion: "NEQUI",
      valor: 100000,
    },
  ],
});

const docMixto = () => ({
  tipo: "FV",
  tipoComprobante: "FV-1",
  nit: "901989453",
  cliente: "AGROPECUARIA PIEDEMONTES",
  fecha: "2026-04-28",
  numeroComprobante: "23232",
  prefijo: "FELE",
  factura: "23232",
  total: 21087000,
  anulado: false,
  lineas: [
    {
      cuenta: "110520",
      fp: 1,
      descripcion: "MOSTRADOR",
      valor: 11000000,
    },
    {
      cuenta: "13050501",
      fp: 3,
      descripcion: "CREDITO CLIENTES",
      valor: 10087000,
    },
  ],
});

const docSoloCredito = () => ({
  tipo: "FV",
  tipoComprobante: "FV-1",
  nit: "111749561",
  cliente: "MORALES ALVAREZ CAROLINA",
  fecha: "2026-04-07",
  numeroComprobante: "22665",
  prefijo: "FELE",
  factura: "22665",
  total: 131700,
  anulado: false,
  lineas: [
    {
      cuenta: "13050501",
      fp: 3,
      descripcion: "CREDITO CLIENTES",
      valor: 131700,
    },
  ],
});

const docDvContado = () => ({
  tipo: "DV",
  tipoComprobante: "DV-1",
  nit: "17701185",
  cliente: "CORREA CORREA ESTEBAN DE JESUS",
  fecha: "2026-04-16",
  numeroComprobante: "1166",
  prefijo: "FELE",
  factura: "22902",
  total: 3838000,
  anulado: false,
  lineas: [
    {
      cuenta: "11101001",
      fp: 4,
      descripcion: "CONTADO BANCOLOMBIA EMPRESA",
      valor: 3838000,
    },
  ],
});

const docAnulado = () => ({
  tipo: "DV",
  tipoComprobante: "DV-1",
  nit: "1109413795",
  cliente: "GUTIERREZ GAVIRIA",
  fecha: "2026-04-23",
  numeroComprobante: "1177",
  prefijo: "FELE",
  factura: "23110",
  total: 0,
  anulado: true,
  lineas: [],
});

describe("transformDocumento", () => {
  it("transforma FV 100% contado a fila positiva", () => {
    const fila = transformDocumento(docContadoPuro(), 2026, 4);
    expect(fila).toBeTruthy();
    expect(fila.valor_recaudo).toBe(105000);
    expect(fila.dias_mora).toBe(0);
    expect(fila.aplica_comision).toBe(true);
    expect(fila.factura).toBe("22606");
    expect(fila.cliente_nit).toBe("222222222");
    expect(fila.fecha_abono).toBe("2026-04-06");
    expect(fila.periodo_year).toBe(2026);
    expect(fila.periodo_month).toBe(4);
    expect(fila.vendedor_codigo).toBe("SIN_VENDEDOR");
  });

  it("transforma FV mixto sumando solo lineas no-1305", () => {
    const fila = transformDocumento(docMixto(), 2026, 4);
    expect(fila).toBeTruthy();
    expect(fila.valor_recaudo).toBe(11000000); // solo MOSTRADOR, no CREDITO
  });

  it("omite FV 100% credito (retorna null)", () => {
    const fila = transformDocumento(docSoloCredito(), 2026, 4);
    expect(fila).toBeNull();
  });

  it("transforma DV con valor negativo", () => {
    const fila = transformDocumento(docDvContado(), 2026, 4);
    expect(fila).toBeTruthy();
    expect(fila.valor_recaudo).toBe(-3838000);
  });

  it("omite documentos anulados", () => {
    const fila = transformDocumento(docAnulado(), 2026, 4);
    expect(fila).toBeNull();
  });

  it("usa vendedor del mapa cuando se provee", () => {
    const fila = transformDocumento(docContadoPuro(), 2026, 4, {
      vendedoresPorFactura: { 22606: "V001" },
    });
    expect(fila.vendedor_codigo).toBe("V001");
  });

  it("fallback a SIN_VENDEDOR si no hay match", () => {
    const fila = transformDocumento(docContadoPuro(), 2026, 4, {
      vendedoresPorFactura: { 99999: "V001" },
    });
    expect(fila.vendedor_codigo).toBe("SIN_VENDEDOR");
  });
});

describe("transformContadoDocs", () => {
  it("agrupa filas y desglosa ignorados por motivo", () => {
    const parseResult = {
      documentos: [
        docContadoPuro(),
        docMixto(),
        docSoloCredito(),
        docDvContado(),
        docAnulado(),
      ],
    };
    const { filas, ignorados } = transformContadoDocs(parseResult, 2026, 4);
    expect(filas).toHaveLength(3); // contado puro + mixto + DV
    expect(ignorados.soloCredito).toBe(1);
    expect(ignorados.anulados).toBe(1);
  });

  it("respeta totales: suma de filas FV positivas + DV negativas", () => {
    const parseResult = {
      documentos: [docContadoPuro(), docDvContado()],
    };
    const { filas } = transformContadoDocs(parseResult, 2026, 4);
    const total = filas.reduce((s, f) => s + f.valor_recaudo, 0);
    expect(total).toBe(105000 - 3838000);
  });
});

describe("applyContadoCommissionRules", () => {
  it("marca comisionable con factura matcheada, vendedor real y mora <=70", () => {
    const rows = applyContadoCommissionRules(
      [
        {
          factura: "22606",
          vendedor_codigo: "14",
          dias_mora: 64,
          _sinMatchCartera: false,
          _sinMatchFactura: false,
        },
      ],
      70,
    );

    expect(rows[0].aplica_comision).toBe(true);
    expect(rows[0]._contado_block_reason).toBeNull();
    expect(getContadoBlockingIssues(rows)).toHaveLength(0);
  });

  it("excluye de comisionable cuando supera 70 dias sin bloquear la carga", () => {
    const rows = applyContadoCommissionRules(
      [
        {
          factura: "22606",
          vendedor_codigo: "14",
          dias_mora: 71,
          _sinMatchCartera: false,
          _sinMatchFactura: false,
        },
      ],
      70,
    );

    expect(rows[0].aplica_comision).toBe(false);
    expect(rows[0]._contado_block_reason).toBeNull();
    expect(getContadoBlockingIssues(rows)).toHaveLength(0);
  });

  it("bloquea contado sin match exacto de factura y no usa SIN_VENDEDOR", () => {
    const rows = applyContadoCommissionRules(
      [
        {
          factura: "99999",
          vendedor_codigo: "SIN_VENDEDOR",
          dias_mora: -1,
          _sinMatchCartera: true,
          _sinMatchFactura: true,
        },
      ],
      70,
    );

    expect(rows[0].aplica_comision).toBe(false);
    expect(rows[0]._contado_block_reason).toBe(
      "Factura sin match en ventas/cartera",
    );
    expect(getContadoBlockingIssues(rows)).toHaveLength(1);
    expect(rows[0]._contado_overridden).toBe(false);
  });

  it("con allowSinVendedor=true no bloquea la carga pero mantiene no comisionable", () => {
    const rowSinMatch = {
      factura: "23435",
      vendedor_codigo: "SIN_VENDEDOR",
      dias_mora: -1,
      _sinMatchCartera: true,
      _sinMatchFactura: true,
    };
    const rowOk = {
      factura: "23310",
      vendedor_codigo: "6",
      dias_mora: 2,
      _sinMatchCartera: false,
      _sinMatchFactura: false,
    };
    const rows = applyContadoCommissionRules([rowSinMatch, rowOk], 70, {
      allowSinVendedor: true,
    });

    // La fila sin match queda no comisionable y marcada como overrideada
    expect(rows[0].aplica_comision).toBe(false);
    expect(rows[0]._contado_block_reason).toBe("Factura sin match en ventas/cartera");
    expect(rows[0]._contado_overridden).toBe(true);

    // La fila ok sigue comisionable
    expect(rows[1].aplica_comision).toBe(true);
    expect(rows[1]._contado_overridden).toBe(false);

    // Con allowSinVendedor=true, getContadoBlockingIssues devuelve vacío
    expect(getContadoBlockingIssues(rows, { allowSinVendedor: true })).toHaveLength(0);

    // Sin la flag, sigue reportando el bloqueo
    expect(getContadoBlockingIssues(rows)).toHaveLength(1);
  });
});

describe("statsContado", () => {
  it("clasifica documentos correctamente", () => {
    const parseResult = {
      documentos: [
        docContadoPuro(),
        docMixto(),
        docSoloCredito(),
        docDvContado(),
        docAnulado(),
      ],
    };
    const s = statsContado(parseResult);
    expect(s.docsContado).toBe(2); // contado puro + DV contado puro
    expect(s.docsMixtos).toBe(1);
    expect(s.docsSoloCredito).toBe(1);
    expect(s.docsAnulados).toBe(1);
    expect(s.totalContadoVentas).toBe(105000 + 11000000);
    expect(s.totalContadoDevoluciones).toBe(3838000);
    expect(s.totalContadoNeto).toBe(105000 + 11000000 - 3838000);
  });
});

describe("resumenPorFormaDePago", () => {
  it("agrupa por (cuenta,fp) y separa ventas vs devoluciones", () => {
    const parseResult = {
      documentos: [
        docContadoPuro(),
        docMixto(),
        docDvContado(),
      ],
    };
    const r = resumenPorFormaDePago(parseResult);
    const mostrador = r.find((x) => x.cuenta === "110520" && x.fp === 1);
    expect(mostrador.ventas).toBe(5000 + 11000000);
    expect(mostrador.devoluciones).toBe(0);
    expect(mostrador.esCredito).toBe(false);
    const credito = r.find((x) => x.cuenta === "13050501");
    expect(credito.ventas).toBe(10087000);
    expect(credito.esCredito).toBe(true);
    const banco = r.find((x) => x.cuenta === "11101001");
    expect(banco.devoluciones).toBe(3838000);
  });
});
