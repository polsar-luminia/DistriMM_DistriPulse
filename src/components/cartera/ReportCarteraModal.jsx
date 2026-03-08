/**
 * @fileoverview Modal for generating filtered cartera reports (PDF/Excel).
 * Enriches cartera_items with distrimm_clientes data (phone, address, barrio, municipio).
 * @module components/cartera/ReportCarteraModal
 */

import React, { useState, useMemo } from "react";
import { X, FileText, FileSpreadsheet, Filter, Loader2 } from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import {
  generarCarteraPDF,
  generarCarteraExcel,
} from "../../utils/reporteCartera";

const formatCOP = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function ReportCarteraModal({
  isOpen,
  onClose,
  items,
  vendedorNombreMap,
  nitVendedorMap,
  clientesDataMap,
}) {
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [selectedVendedores, setSelectedVendedores] = useState([]);
  const [selectedMunicipios, setSelectedMunicipios] = useState([]);
  const [groupBy, setGroupBy] = useState("municipio");
  const [isGenerating, setIsGenerating] = useState(false);

  // Enrich items with all available client data
  const enrichedItems = useMemo(() => {
    if (!items?.length) return [];
    return items.map((item) => {
      const nit = item.tercero_nit;
      const cliente = clientesDataMap?.[nit] || {};
      const vendedorCodigo =
        item.vendedor_codigo || nitVendedorMap?.[nit] || cliente.vendedor_codigo || "SIN";
      return {
        ...item,
        _vendedor:
          vendedorNombreMap?.[vendedorCodigo] ||
          `Vendedor ${item.vendedor_codigo || "Sin Asignar"}`,
        _vendedorCodigo: vendedorCodigo,
        _municipio: cliente.municipio || "Sin Información",
        _barrio: cliente.barrio || "",
        _celular: cliente.celular || cliente.telefono_1 || "",
        _direccion: cliente.direccion || "",
        _nombreCompleto: cliente.nombre_completo || item.nombre_tercero || "",
        _estado: (item.dias_mora || 0) > 0 ? "VENCIDA" : "AL DÍA",
      };
    });
  }, [items, vendedorNombreMap, nitVendedorMap, clientesDataMap]);

  // Extract unique filter options
  const vendedoresUnicos = useMemo(
    () => [...new Set(enrichedItems.map((i) => i._vendedor))].sort(),
    [enrichedItems],
  );
  const municipiosUnicos = useMemo(
    () => [...new Set(enrichedItems.map((i) => i._municipio))].sort(),
    [enrichedItems],
  );

  // Apply all active filters
  const filteredItems = useMemo(() => {
    return enrichedItems.filter((item) => {
      if (filterStatus === "VENCIDA" && item._estado !== "VENCIDA") return false;
      if (filterStatus === "AL_DIA" && item._estado !== "AL DÍA") return false;
      if (selectedVendedores.length > 0 && !selectedVendedores.includes(item._vendedor))
        return false;
      if (selectedMunicipios.length > 0 && !selectedMunicipios.includes(item._municipio))
        return false;
      return true;
    });
  }, [enrichedItems, filterStatus, selectedVendedores, selectedMunicipios]);

  // Summary stats
  const totalCartera = useMemo(
    () => filteredItems.reduce((sum, i) => sum + Number(i.valor_saldo || 0), 0),
    [filteredItems],
  );
  const totalVencida = useMemo(
    () =>
      filteredItems
        .filter((i) => i._estado === "VENCIDA")
        .reduce((sum, i) => sum + Number(i.valor_saldo || 0), 0),
    [filteredItems],
  );
  const numClientes = useMemo(
    () => new Set(filteredItems.map((i) => i.tercero_nit).filter(Boolean)).size,
    [filteredItems],
  );

  const handleClose = () => {
    setFilterStatus("ALL");
    setSelectedVendedores([]);
    setSelectedMunicipios([]);
    setGroupBy("municipio");
    onClose();
  };

  const toggleVendedor = (v) => {
    setSelectedVendedores((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  };

  const toggleMunicipio = (m) => {
    setSelectedMunicipios((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const handleExportPDF = async () => {
    setIsGenerating(true);
    try {
      await generarCarteraPDF({
        items: filteredItems,
        groupBy,
        filters: {
          status: filterStatus,
          groupBy,
          selectedVendedores,
          selectedMunicipios,
        },
      });
      sileo.success("PDF generado exitosamente");
    } catch (err) {
      sileo.error("Error al generar PDF");
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportExcel = async () => {
    setIsGenerating(true);
    try {
      generarCarteraExcel({
        items: filteredItems,
        groupBy,
        filters: {
          status: filterStatus,
          groupBy,
          selectedVendedores,
          selectedMunicipios,
        },
      });
      sileo.success("Excel generado exitosamente");
    } catch (err) {
      sileo.error("Error al generar Excel");
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">
              Generar Informe de Cartera
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Status filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Estado de Cartera
            </label>
            <div className="flex gap-2">
              {[
                { key: "ALL", label: "Toda" },
                { key: "VENCIDA", label: "Vencida" },
                { key: "AL_DIA", label: "Al Día" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    filterStatus === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Group by toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Agrupar por
            </label>
            <div className="flex gap-2">
              {[
                { key: "municipio", label: "Municipio" },
                { key: "vendedor", label: "Vendedor" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setGroupBy(key)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    groupBy === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Vendedores filter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                Filtrar Vendedores
              </label>
              {selectedVendedores.length > 0 && (
                <button
                  onClick={() => setSelectedVendedores([])}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Todos
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {vendedoresUnicos.map((v) => (
                <label
                  key={v}
                  className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1.5 py-1"
                >
                  <input
                    type="checkbox"
                    checked={selectedVendedores.includes(v)}
                    onChange={() => toggleVendedor(v)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="truncate">{v}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Municipios filter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                Filtrar Municipios
              </label>
              {selectedMunicipios.length > 0 && (
                <button
                  onClick={() => setSelectedMunicipios([])}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Todos
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {municipiosUnicos.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1.5 py-1"
                >
                  <input
                    type="checkbox"
                    checked={selectedMunicipios.includes(m)}
                    onChange={() => toggleMunicipio(m)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="truncate">{m}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview bar */}
          <div className="bg-slate-50 rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-slate-700">
              {filteredItems.length.toLocaleString()} facturas
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">
              {numClientes} clientes
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600">
              {formatCOP(totalCartera)} cartera
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-red-600 font-medium">
              {formatCOP(totalVencida)} vencida
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-xl">
          <button
            onClick={handleClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isGenerating || filteredItems.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Exportar Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isGenerating || filteredItems.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
