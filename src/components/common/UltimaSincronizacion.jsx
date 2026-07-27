import React, { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUltimaSincronizacion } from "../../services/syncService";
import { formatDateTimeBogota } from "../../utils/formatters";
import { timeAgo } from "../../utils/timeAgo";

/** El agente corre cada 2 h; refrescar cada 10 min basta para no quedar viejo. */
const REFRESCO_MS = 10 * 60 * 1000;

/**
 * Indicador de la última sincronización del ERP SAMIT, al lado del selector de
 * corte. Se consulta por su cuenta (sin props) porque el dato es global a la
 * aplicación y no depende de la carga que se esté viendo.
 *
 * No se muestra nada mientras carga ni si la bitácora está vacía: un hueco es
 * preferible a un "N/A" permanente en la barra superior.
 */
export default function UltimaSincronizacion() {
  const [sync, setSync] = useState(null);

  useEffect(() => {
    let cancelado = false;
    const leer = async () => {
      const { data } = await getUltimaSincronizacion();
      if (!cancelado && data?.fecha) setSync(data);
    };
    leer();
    const id = setInterval(leer, REFRESCO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  if (!sync) return null;

  const conFallas = sync.fallidos.length > 0;
  const detalle = conFallas
    ? `${sync.fallidos.length} de ${sync.datasets} datasets no quedaron en "ok": ${sync.fallidos.join(", ")}`
    : `${sync.datasets} datasets sincronizados desde el ERP SAMIT`;

  return (
    <div
      title={`Última sincronización — ${timeAgo(sync.fecha)}. ${detalle}.`}
      className={cn(
        "hidden md:flex items-center gap-2 rounded-lg px-2.5 py-1.5 border",
        conFallas
          ? "bg-amber-50 border-amber-200"
          : "bg-slate-100 border-slate-200",
      )}
    >
      {conFallas ? (
        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
      ) : (
        <RefreshCw size={14} className="text-emerald-600 shrink-0" />
      )}
      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
        <span className="hidden lg:inline text-slate-500 font-medium">
          Sincronizado:{" "}
        </span>
        {formatDateTimeBogota(sync.fecha)}
      </span>
    </div>
  );
}
