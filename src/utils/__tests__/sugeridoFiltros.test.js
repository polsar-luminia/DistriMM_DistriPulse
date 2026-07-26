import { describe, test, expect } from "vitest";
import {
  FILTROS_INICIALES,
  aplicarAlcance,
  aplicarEstado,
  aplicarBusqueda,
  aplicarFiltros,
  contarFiltrosActivos,
  describirFiltros,
} from "../sugeridoFiltros";

/** Fila mínima con los campos que devuelve fn_sugerido_pedidos. */
const fila = (over = {}) => ({
  producto_codigo: "1001",
  producto_nombre: "MAIZ AMARILLO 40KG",
  marca: "CONTEGRAL",
  categoria_nombre: "CONCENTRADOS",
  stock: 10,
  stock_valor: 500000,
  dias_sin_venta: 5,
  clasificacion: "NORMAL",
  sugerido_cantidad: 0,
  sugerido_costo: 0,
  costo_unitario: 50000,
  ...over,
});

const filtros = (over = {}) => ({ ...FILTROS_INICIALES, ...over });

describe("aplicarAlcance — proveedor y línea", () => {
  const rows = [
    fila({ producto_codigo: "A", marca: "CONTEGRAL", categoria_nombre: "CONCENTRADOS" }),
    fila({ producto_codigo: "B", marca: "ADAMA", categoria_nombre: "AGROQUIMICOS" }),
    fila({ producto_codigo: "C", marca: "PREMIER", categoria_nombre: "CONCENTRADOS" }),
  ];

  test("sin selección devuelve todas las filas", () => {
    expect(aplicarAlcance(rows, filtros())).toHaveLength(3);
  });

  test("filtra por un proveedor", () => {
    const r = aplicarAlcance(rows, filtros({ marcas: ["ADAMA"] }));
    expect(r.map((x) => x.producto_codigo)).toEqual(["B"]);
  });

  test("acepta varios proveedores a la vez", () => {
    const r = aplicarAlcance(rows, filtros({ marcas: ["ADAMA", "PREMIER"] }));
    expect(r.map((x) => x.producto_codigo)).toEqual(["B", "C"]);
  });

  test("proveedor y línea se combinan con AND", () => {
    const r = aplicarAlcance(
      rows,
      filtros({ marcas: ["CONTEGRAL", "PREMIER"], categorias: ["CONCENTRADOS"] }),
    );
    expect(r.map((x) => x.producto_codigo)).toEqual(["A", "C"]);
  });

  test("una combinación sin coincidencias devuelve vacío", () => {
    const r = aplicarAlcance(
      rows,
      filtros({ marcas: ["ADAMA"], categorias: ["CONCENTRADOS"] }),
    );
    expect(r).toHaveLength(0);
  });
});

describe("aplicarAlcance — última venta", () => {
  const rows = [
    fila({ producto_codigo: "HOY", dias_sin_venta: 0 }),
    fila({ producto_codigo: "D30", dias_sin_venta: 30 }),
    fila({ producto_codigo: "D31", dias_sin_venta: 31 }),
    fila({ producto_codigo: "D90", dias_sin_venta: 90 }),
    fila({ producto_codigo: "D120", dias_sin_venta: 120 }),
    fila({ producto_codigo: "NUNCA", dias_sin_venta: null }),
  ];
  const codigos = (key) =>
    aplicarAlcance(rows, filtros({ ultimaVenta: key })).map(
      (r) => r.producto_codigo,
    );

  test("los rangos son acumulativos e incluyen el límite", () => {
    expect(codigos("D30")).toEqual(["HOY", "D30"]);
    expect(codigos("D60")).toEqual(["HOY", "D30", "D31"]);
    expect(codigos("D90")).toEqual(["HOY", "D30", "D31", "D90"]);
  });

  test("'más de 90 días' empieza en 91, no en 90", () => {
    expect(codigos("MAS_90")).toEqual(["D120"]);
  });

  test("'sin ventas en la ventana' aísla las filas sin fecha", () => {
    expect(codigos("SIN_VENTA")).toEqual(["NUNCA"]);
  });

  test("las filas sin fecha no se cuelan en ningún rango de días", () => {
    for (const key of ["D30", "D60", "D90", "MAS_90"]) {
      expect(codigos(key)).not.toContain("NUNCA");
    }
  });

  test("'TODAS' no filtra nada", () => {
    expect(codigos("TODAS")).toHaveLength(6);
  });
});

describe("aplicarAlcance — existencia", () => {
  const rows = [
    fila({ producto_codigo: "CON", stock: 5 }),
    fila({ producto_codigo: "CERO", stock: 0 }),
    fila({ producto_codigo: "NEG", stock: -2 }),
  ];

  test("'con stock' exige cantidad positiva", () => {
    const r = aplicarAlcance(rows, filtros({ stock: "CON_STOCK" }));
    expect(r.map((x) => x.producto_codigo)).toEqual(["CON"]);
  });

  test("'sin stock' incluye el cero y los negativos", () => {
    const r = aplicarAlcance(rows, filtros({ stock: "SIN_STOCK" }));
    expect(r.map((x) => x.producto_codigo)).toEqual(["CERO", "NEG"]);
  });
});

describe("aplicarEstado", () => {
  const rows = [
    fila({ producto_codigo: "A", clasificacion: "AGOTADO", sugerido_cantidad: 12 }),
    fila({ producto_codigo: "B", clasificacion: "MUERTO", sugerido_cantidad: 0 }),
    fila({ producto_codigo: "C", clasificacion: "NORMAL", sugerido_cantidad: 3 }),
  ];

  test("'TODOS' devuelve todo", () => {
    expect(aplicarEstado(rows, "TODOS")).toHaveLength(3);
  });

  test("'POR_PEDIR' es sugerido > 0, no una clasificación", () => {
    const r = aplicarEstado(rows, "POR_PEDIR");
    expect(r.map((x) => x.producto_codigo)).toEqual(["A", "C"]);
  });

  test("filtra por clasificación", () => {
    expect(aplicarEstado(rows, "MUERTO").map((x) => x.producto_codigo)).toEqual([
      "B",
    ]);
  });
});

describe("aplicarBusqueda", () => {
  const rows = [
    fila({ producto_codigo: "1001", producto_nombre: "MAIZ AMARILLO" }),
    fila({
      producto_codigo: "2002",
      producto_nombre: "SOYA INTEGRAL",
      marca: "ADAMA",
      categoria_nombre: "AGROQUIMICOS",
    }),
  ];

  test("busca por código", () => {
    expect(aplicarBusqueda(rows, "2002")).toHaveLength(1);
  });

  test("busca por nombre sin distinguir mayúsculas", () => {
    expect(aplicarBusqueda(rows, "maiz")).toHaveLength(1);
  });

  test("busca por marca y por línea", () => {
    expect(aplicarBusqueda(rows, "adama")).toHaveLength(1);
    expect(aplicarBusqueda(rows, "agroqui")).toHaveLength(1);
  });

  test("una búsqueda vacía o de espacios no filtra", () => {
    expect(aplicarBusqueda(rows, "")).toHaveLength(2);
    expect(aplicarBusqueda(rows, "   ")).toHaveLength(2);
  });
});

describe("aplicarFiltros — combinación completa", () => {
  test("encadena alcance, estado y búsqueda", () => {
    const rows = [
      fila({
        producto_codigo: "OK",
        marca: "ADAMA",
        clasificacion: "AGOTADO",
        sugerido_cantidad: 5,
        dias_sin_venta: 10,
        stock: 0,
      }),
      // Mismo proveedor y estado, pero fuera del rango de última venta
      fila({
        producto_codigo: "VIEJO",
        marca: "ADAMA",
        clasificacion: "AGOTADO",
        sugerido_cantidad: 5,
        dias_sin_venta: 200,
        stock: 0,
      }),
      // Coincide en todo menos el proveedor
      fila({
        producto_codigo: "OTRO",
        marca: "CONTEGRAL",
        clasificacion: "AGOTADO",
        sugerido_cantidad: 5,
        dias_sin_venta: 10,
        stock: 0,
      }),
    ];
    const r = aplicarFiltros(
      rows,
      filtros({
        marcas: ["ADAMA"],
        ultimaVenta: "D30",
        estado: "POR_PEDIR",
        search: "maiz",
      }),
    );
    expect(r.map((x) => x.producto_codigo)).toEqual(["OK"]);
  });
});

describe("contarFiltrosActivos", () => {
  test("cero con los filtros iniciales", () => {
    expect(contarFiltrosActivos(FILTROS_INICIALES)).toBe(0);
  });

  test("una selección múltiple cuenta como un solo filtro", () => {
    expect(contarFiltrosActivos(filtros({ marcas: ["A", "B", "C"] }))).toBe(1);
  });

  test("una búsqueda de solo espacios no cuenta", () => {
    expect(contarFiltrosActivos(filtros({ search: "   " }))).toBe(0);
  });

  test("suma cada dimensión activa", () => {
    expect(
      contarFiltrosActivos(
        filtros({
          estado: "MUERTO",
          marcas: ["A"],
          categorias: ["X"],
          ultimaVenta: "D30",
          stock: "CON_STOCK",
          search: "maiz",
        }),
      ),
    ).toBe(6);
  });
});

describe("describirFiltros", () => {
  test("sin filtros describe el universo completo", () => {
    const filas = Object.fromEntries(describirFiltros(FILTROS_INICIALES));
    expect(filas.Proveedores).toBe("Todos");
    expect(filas["Líneas de producto"]).toBe("Todas");
    expect(filas.Estado).toBe("Todos");
  });

  test("lista los proveedores seleccionados", () => {
    const filas = Object.fromEntries(
      describirFiltros(filtros({ marcas: ["ADAMA", "CONTEGRAL"] })),
    );
    expect(filas.Proveedores).toBe("ADAMA, CONTEGRAL");
  });

  test("traduce las claves a las etiquetas de la interfaz", () => {
    const filas = Object.fromEntries(
      describirFiltros(filtros({ ultimaVenta: "MAS_90", stock: "SIN_STOCK" })),
    );
    expect(filas["Última venta"]).toBe("Hace más de 90 días");
    expect(filas.Stock).toBe("Sin stock");
  });
});
