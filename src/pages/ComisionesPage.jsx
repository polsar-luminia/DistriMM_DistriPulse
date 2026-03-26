import { useState } from "react";
import {
  Receipt,
  Ban,
  BookOpen,
  CalendarRange,
  Wallet,
  Settings,
  Info,
} from "lucide-react";
import useComisiones from "../hooks/useComisiones";
import { TabButton } from "../components/comisiones/ComisionesShared";
import VentasTab from "../components/comisiones/VentasTab";
import RecaudoTab from "../components/comisiones/RecaudoTab";
import ExclusionesTab from "../components/comisiones/ExclusionesTab";
import CatalogoTab from "../components/comisiones/CatalogoTab";
import ReporteMensualTab from "../components/comisiones/ReporteMensualTab";
import PresupuestosTab from "../components/comisiones/PresupuestosTab";

export default function ComisionesPage() {
  const [activeTab, setActiveTab] = useState("ventas");
  const hook = useComisiones();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Comisiones
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestion de ventas, exclusiones y calculo de comisiones por vendedor
        </p>
      </div>

      {/* Orden de carga */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl px-5 py-3 flex items-center gap-4 text-sm text-indigo-800 shadow-sm">
        <div className="bg-indigo-100 p-2 rounded-lg shrink-0">
          <Info size={18} className="text-indigo-600" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-indigo-900">Orden de carga:</span>
          <span className="bg-white px-2.5 py-1 rounded-md font-semibold text-indigo-700 border border-indigo-100 text-xs">
            1. Catalogo / IVA
          </span>
          <span className="text-indigo-300 font-bold">→</span>
          <span className="bg-white px-2.5 py-1 rounded-md font-semibold text-indigo-700 border border-indigo-100 text-xs">
            2. Ventas
          </span>
          <span className="text-indigo-300 font-bold">→</span>
          <span className="bg-white px-2.5 py-1 rounded-md font-semibold text-indigo-700 border border-indigo-100 text-xs">
            3. Recaudo
          </span>
          <span className="text-indigo-300 font-bold">→</span>
          <span className="bg-white px-2.5 py-1 rounded-md font-semibold text-emerald-700 border border-emerald-200 text-xs">
            4. Generar Reporte
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 rounded-xl p-1.5 w-fit">
        <TabButton
          active={activeTab === "ventas"}
          onClick={() => setActiveTab("ventas")}
          icon={Receipt}
        >
          Ventas
        </TabButton>
        <TabButton
          active={activeTab === "recaudo"}
          onClick={() => setActiveTab("recaudo")}
          icon={Wallet}
        >
          Recaudo
        </TabButton>
        <TabButton
          active={activeTab === "exclusiones"}
          onClick={() => setActiveTab("exclusiones")}
          icon={Ban}
        >
          Exclusiones
        </TabButton>
        <TabButton
          active={activeTab === "catalogo"}
          onClick={() => setActiveTab("catalogo")}
          icon={BookOpen}
        >
          Catalogo
        </TabButton>
        <TabButton
          active={activeTab === "reporte"}
          onClick={() => setActiveTab("reporte")}
          icon={CalendarRange}
        >
          Reporte Mensual
        </TabButton>
        <TabButton
          active={activeTab === "presupuestos"}
          onClick={() => setActiveTab("presupuestos")}
          icon={Settings}
        >
          Cuotas
        </TabButton>
      </div>

      {/* Tab content */}
      {activeTab === "ventas" && <VentasTab hook={hook} />}
      {activeTab === "recaudo" && <RecaudoTab hook={hook} />}
      {activeTab === "exclusiones" && <ExclusionesTab hook={hook} />}
      {activeTab === "catalogo" && <CatalogoTab hook={hook} />}
      {activeTab === "reporte" && <ReporteMensualTab hook={hook} />}
      {activeTab === "presupuestos" && <PresupuestosTab hook={hook} />}
    </div>
  );
}
