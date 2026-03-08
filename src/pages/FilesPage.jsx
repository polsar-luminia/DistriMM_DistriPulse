import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "../lib/supabase";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import {
  Database,
  Trash2,
  Calendar,
  Upload,
  FileText,
  Clock,
  ChevronRight,
  CheckCircle,
  Activity,
  AlertOctagon,
} from "lucide-react";
import {
  Card,
  formatCurrency,
  formatFullCurrency,
} from "../components/dashboard/DashboardShared";
import { sileo } from "sileo";

// Helper for formatting dates locally
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function FilesPage() {
  const [confirmProps, confirm] = useConfirm();
  const context = useOutletContext();
  const {
    availableLoads = [],
    currentLoadId,
    onLoadChange,
    onDeleteLoad,
    onUploadClick,
    showExactNumbers = false,
    error: loadError, // Get error from context
  } = context || {};

  const [isTesting, setIsTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState(null);

  const formatMoney = (val) =>
    showExactNumbers ? formatFullCurrency(val) : formatCurrency(val);

  const runDiagnostics = async () => {
    setIsTesting(true);
    setDbStatus(null);

    let report = [];
    const addLog = (msg, success = true) => report.push({ msg, success });

    try {
      // 1. Check Auth Session
      addLog("Verificando sesión de usuario...");
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError) throw new Error("Error de Auth: " + authError.message);
      if (!session) {
        addLog("Usuario NO autenticado (Anon/Público)", false);
      } else {
        addLog(`Usuario autenticado: ${session.user.email}`);
      }

      // 2. Check Loads Table (RLS)
      addLog("Verificando tabla 'historial_cargas'...");
      const { data: loads, error: loadsError, count: loadsCount } = await supabase
        .from("historial_cargas")
        .select("*", { count: "exact", head: false })
        .limit(1);

      if (loadsError) {
        addLog(`Error leyendo Cargas: ${loadsError.message} (${loadsError.code})`, false);
        if (loadsError.code === "42501") addLog("TIP: RLS bloquea lectura. Revisa políticas SELECT.", false);
      } else {
        addLog(`Lectura Cargas OK. Total registros: ${loadsCount || 0}`);
        if (loads && loads.length > 0) addLog(`Muestra ID: ${loads[0].id}`);
      }

      // 3. Check Items Table (RLS)
      addLog("Verificando tabla 'cartera_items'...");
      const { error: itemsError, count: itemsCount } = await supabase
        .from("cartera_items")
        .select("*", { count: "exact", head: false })
        .limit(1);

      if (itemsError) {
        addLog(`Error leyendo Items: ${itemsError.message} (${itemsError.code})`, false);
        if (itemsError.code === "42501") addLog("TIP: RLS bloquea lectura. Revisa políticas SELECT.", false);
      } else {
        addLog(`Lectura Items OK. Total registros: ${itemsCount || 0}`);
      }

      // Final Status
      const hasErrors = report.some(r => !r.success);
      setDbStatus({
        success: !hasErrors,
        message: hasErrors ? "Se encontraron problemas." : "Todos los sistemas operativos.",
        details: report
      });

      if (!hasErrors) sileo.success({ title: "Diagnóstico Exitoso" });
      else sileo.error({ title: "Diagnóstico con Errores" });

    } catch (e) {
      setDbStatus({ success: false, message: `Error Crítico: ${e.message}`, details: report });
      sileo.error({ title: "Error crítico en diagnóstico" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Database className="text-indigo-600" size={28} />
            Gestión de Datos
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Historial de cargas y archivos procesados en el sistema
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runDiagnostics}
            disabled={isTesting}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200 transition-all flex items-center gap-2"
          >
            {isTesting ? <Clock size={18} className="animate-spin" /> : <Activity size={18} />}
            {isTesting ? "Comprobando..." : "Diagnosticar"}
          </button>
          <button
            onClick={onUploadClick}
            className="group px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-black text-sm hover:bg-indigo-500 transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/10 hover:shadow-indigo-900/20 active:scale-95"
          >
            <Upload size={18} className="group-hover:bounce" /> Nueva Carga
          </button>
        </div>
      </div>

      {/* Error / Diagnostic Status */}
      {(loadError || dbStatus) && (
        <div className={cn("p-4 rounded-lg border flex items-start gap-3", (loadError || dbStatus?.success === false)
          ? "bg-rose-50 border-rose-200 text-rose-700"
          : "bg-emerald-50 border-emerald-200 text-indigo-700"
          )}>
          {/* Icon */}
          {(loadError || dbStatus?.success === false) ? <AlertOctagon size={20} /> : <CheckCircle size={20} />}

          <div className="flex-1">
            <h4 className="font-bold text-sm">Estado del Sistema</h4>
            {loadError && (
              <p className="text-xs mt-1">
                <strong>Error de Carga:</strong> {typeof loadError === 'object' ? JSON.stringify(loadError) : loadError}
              </p>
            )}
            {dbStatus && (
              <p className="text-xs mt-1">
                <strong>Diagnóstico DB:</strong> {dbStatus.message}
                {dbStatus.details && (
                  <ul className="mt-2 space-y-1 bg-white/50 p-2 rounded max-h-40 overflow-y-auto">
                    {dbStatus.details.map((log, idx) => (
                      <li key={idx} className={cn("text-[10px]", log.success ? 'text-indigo-700' : 'text-rose-700 font-bold')}>
                        {log.success ? '✓' : '✕'} {log.msg}
                      </li>
                    ))}
                  </ul>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Files Grid */}
      {availableLoads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableLoads.map((load) => {
            const isActive = load.id === currentLoadId;

            return (
              <Card
                key={load.id}
                className={cn("group transition-all duration-300 cursor-pointer overflow-hidden border-2 h-full flex flex-col", isActive ? "border-indigo-500 bg-indigo-50/20 shadow-xl scale-[1.02] z-10" : "border-transparent hover:border-slate-200 hover:shadow-md")}
                onClick={() => onLoadChange?.(load.id)}
              >
                <div className="flex items-start justify-between mb-6">
                  <div
                    className={cn("p-4 rounded-xl transition-colors", isActive ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600")}
                  >
                    <FileText size={28} />
                  </div>
                  {isActive ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="bg-indigo-600 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full animate-pulse shadow-sm">
                        En Uso
                      </span>
                    </div>
                  ) : (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-slate-100 text-slate-400 p-1.5 rounded-lg">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-grow">
                  <h3
                    className="font-black text-slate-800 text-lg mb-2 line-clamp-1 group-hover:text-indigo-700 transition-colors"
                    title={load.nombre_archivo}
                  >
                    {load.nombre_archivo || "Carga del Sistema"}
                  </h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3 text-slate-500 font-medium">
                      <div className="p-1.5 bg-slate-50 rounded text-slate-400">
                        <Calendar size={14} />
                      </div>
                      <span>
                        Fecha Corte:{" "}
                        <strong className="text-slate-700">
                          {load.fecha_corte}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 font-medium">
                      <div className="p-1.5 bg-slate-50 rounded text-slate-400">
                        <Clock size={14} />
                      </div>
                      <span>Procesado: {formatDate(load.created_at)}</span>
                    </div>

                    {load.total_valor_cartera && (
                      <div
                        className={cn("mt-4 pt-4 border-t", isActive ? "border-indigo-100" : "border-slate-100")}
                      >
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">
                          Volumen Procesado
                        </p>
                        <p
                          className={cn("text-2xl font-black", isActive ? "text-indigo-700" : "text-slate-800")}
                        >
                          {formatMoney(load.total_valor_cartera)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div
                  className={cn("mt-6 pt-4 border-t flex items-center justify-between", isActive ? "border-indigo-100" : "border-slate-100 opacity-60 group-hover:opacity-100")}
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase italic">
                    ID: {load.id.substring(0, 8)}
                  </span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm({
                        title: "Eliminar carga",
                        message: "Se eliminaran todos los registros de esta carga. Esta accion no se puede deshacer.",
                        confirmText: "Eliminar",
                        cancelText: "Cancelar",
                        variant: "danger",
                      });
                      if (ok) {
                        const deleteOp = (async () => {
                          const result = await onDeleteLoad?.(load.id);
                          if (!result?.success) throw new Error(result?.error?.message || "Desconocido");
                          return result;
                        })();
                        sileo.promise(deleteOp, {
                          loading: { title: "Eliminando carga..." },
                          success: { title: "Carga eliminada correctamente" },
                          error: (err) => ({ title: "Error eliminando carga", description: err.message }),
                        });
                      }
                    }}
                    className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Eliminar carga"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-20 text-center bg-slate-50 border-dashed border-2 border-slate-200">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-200">
            <Database size={40} />
          </div>
          <h3 className="font-black text-slate-800 text-xl mb-2">
            Sin Datos Cargados
          </h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-8 font-medium">
            Su panel de control está listo. Suba un archivo de cartera para
            desplegar el análisis financiero impulsado por IA.
          </p>
          <button
            onClick={onUploadClick}
            className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-900/20 active:scale-95 flex items-center gap-3 mx-auto"
          >
            <Upload size={20} /> Cargar Primer Archivo
          </button>
        </Card>
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
