import { useEffect } from "react";
import { useComisionesCargas } from "./comisiones/useComisionesCargas";
import { useComisionesCalculo } from "./comisiones/useComisionesCalculo";
import { useComisionesExclusiones } from "./comisiones/useComisionesExclusiones";
import { useComisionesCatalogo } from "./comisiones/useComisionesCatalogo";
import { useComisionesRecaudos } from "./comisiones/useComisionesRecaudos";

// Re-export utility functions for external consumers (e.g. VentasTab)
export { getExclusionInfo, buildExclusionLookups } from "./comisiones/utils";

export default function useComisiones() {
  const cargas = useComisionesCargas();
  const catalogoHook = useComisionesCatalogo();
  const exclusionesHook = useComisionesExclusiones(cargas.selectedCargaId);
  const calculo = useComisionesCalculo(
    cargas.selectedCargaId,
    catalogoHook.catalogo,
    exclusionesHook.exclusiones,
  );
  const recaudos = useComisionesRecaudos();

  // Destructure to omit internal-only setFetchComisionesRef from the public API
  const { setFetchComisionesRef, ...exclusiones } = exclusionesHook;

  // Wire fetchComisiones into exclusiones via ref (breaks circular dep)
  useEffect(() => {
    setFetchComisionesRef(calculo.fetchComisiones);
  }, [calculo.fetchComisiones, setFetchComisionesRef]);

  return {
    // Cargas
    ...cargas,

    // Calculo (comisiones, ventas, reporte)
    ...calculo,

    // Exclusiones
    ...exclusiones,

    // Catalogo
    ...catalogoHook,

    // Recaudos + Presupuestos
    ...recaudos,
  };
}
