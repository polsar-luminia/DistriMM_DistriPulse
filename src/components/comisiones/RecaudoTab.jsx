import React, { useState, useMemo, useEffect, useContext } from "react";
import {
  Wallet,
  Upload,
  Calendar,
  Loader2,
  DollarSign,
  CheckCircle,
  XCircle,
  Percent,
  ChevronDown,
  ChevronUp,
  Clock,
  Tag,
} from "lucide-react";
import { formatCurrency, formatFullCurrency } from "../../utils/formatters";
import { clickableProps } from "@/utils/a11y";
import { Card, KpiCard, EmptyState, MESES } from "./ComisionesShared";
import RecaudoUploadModal from "./RecaudoUploadModal";
import { RECAUDO_THRESHOLDS } from "../../constants/thresholds";
import { DashboardContext } from "../DashboardManager";
import { getPeriodoOperativo } from "../../utils/periodoOperativo";

const { DIAS_MORA_LIMITE } = RECAUDO_THRESHOLDS;

export default function RecaudoTab({ hook }) {
  const {
    recaudoCargas,
    loadingRecaudoCargas,
    recaudos,
    loadingRecaudos,
    fetchRecaudosPeriodo,
  } = hook;

  // Periodo operativo
  const dashCtx = useContext(DashboardContext);
  const periodo = getPeriodoOperativo(
    dashCtx?.availableLoads?.[0]?.fecha_corte,
  );
  const [selectedMonth, setSelectedMonth] = useState(periodo.month);
  const [selectedYear, setSelectedYear] = useState(periodo.year);

  // Cargar recaudos consolidados del periodo
  useEffect(() => {
    fetchRecaudosPeriodo(selectedYear, selectedMonth);
  }, [fetchRecaudosPeriodo, selectedYear, selectedMonth]);

  const [showModal, setShowModal] = useState(false);
  const [expandedVendedor, setExpandedVendedor] = useState(null);

  // Mapa codigo → nombre desde ventas (ya cargadas en el hook)
  const vendedorNombres = useMemo(() => {
    const map = {};
    (hook.ventasDetail || []).forEach((v) => {
      if (v.vendedor_codigo && v.vendedor_nombre)
        map[v.vendedor_codigo] = v.vendedor_nombre;
    });
    return map;
  }, [hook.ventasDetail]);

  // Derive exclusion reason from persisted data
  const getMotivo = (r) => {
    if (!r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE) return "mora";
    if ((r.valor_excluido_marca || 0) > 0) return "parcial";
    if (r.aplica_comision) return "comisionable";
    return "marca";
  };

  // Aggregate recaudos by vendedor_codigo
  const vendedorStats = useMemo(() => {
    if (!recaudos.length) return [];
    const map = {};
    recaudos.forEach((r) => {
      const cod = r.vendedor_codigo || "SIN VENDEDOR";
      if (!map[cod]) {
        map[cod] = {
          vendedor_codigo: cod,
          totalRecaudado: 0,
          totalComisionable: 0,
          totalExcluido: 0,
          excluidoMora: 0,
          excluidoMarca: 0,
          excluidoIva: 0,
          countMora: 0,
          countMarca: 0,
          items: [],
        };
      }
      const val = Number(r.valor_recaudo || 0);
      const exclMarca = Number(r.valor_excluido_marca || 0);
      const iva = Number(r.valor_iva || 0);
      map[cod].totalRecaudado += val;
      if (!r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE) {
        // Excluido totalmente por mora
        map[cod].totalExcluido += val;
        map[cod].excluidoMora += val;
        map[cod].countMora += 1;
      } else {
        // Comisionable (parcial o total) — descontar exclusiones de marca + IVA
        map[cod].totalComisionable += val - exclMarca - iva;
        map[cod].excluidoMarca += exclMarca;
        map[cod].excluidoIva += iva;
        if (exclMarca > 0) map[cod].countMarca += 1;
        map[cod].totalExcluido += exclMarca + iva;
      }
      map[cod].items.push(r);
    });
    return Object.values(map).sort(
      (a, b) => b.totalComisionable - a.totalComisionable,
    );
  }, [recaudos]);

  // KPI totals
  const totals = useMemo(() => {
    let totalRecaudado = 0;
    let totalComisionable = 0;
    let totalExcluidoMora = 0;
    let totalExcluidoMarca = 0;
    let totalExcluidoIva = 0;
    let countMora = 0;
    let countMarca = 0;
    recaudos.forEach((r) => {
      const val = Number(r.valor_recaudo || 0);
      const exclMarca = Number(r.valor_excluido_marca || 0);
      const iva = Number(r.valor_iva || 0);
      totalRecaudado += val;
      if (!r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE) {
        totalExcluidoMora += val;
        countMora += 1;
      } else {
        totalComisionable += val - exclMarca - iva;
        totalExcluidoMarca += exclMarca;
        totalExcluidoIva += iva;
        if (exclMarca > 0) countMarca += 1;
      }
    });
    const totalExcluido =
      totalExcluidoMora + totalExcluidoMarca + totalExcluidoIva;
    const pctComisionable =
      totalRecaudado > 0 ? (totalComisionable / totalRecaudado) * 100 : 0;
    return {
      totalRecaudado,
      totalComisionable,
      totalExcluido,
      totalExcluidoMora,
      totalExcluidoMarca,
      totalExcluidoIva,
      countMora,
      countMarca,
      pctComisionable,
    };
  }, [recaudos]);

  if (loadingRecaudoCargas) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Period selector */}
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <Calendar size={14} className="text-emerald-600 shrink-0" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {[periodo.year - 1, periodo.year, periodo.year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Cargas count badge */}
        {recaudoCargas.length > 0 && (
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            {recaudoCargas.length} carga{recaudoCargas.length > 1 ? "s" : ""}{" "}
            subida{recaudoCargas.length > 1 ? "s" : ""}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-2 bg-emerald-600 rounded-lg text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Upload size={14} /> Cargar Recaudos
        </button>
      </div>

      {!loadingRecaudos && recaudos.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={`Sin recaudos en ${MESES[selectedMonth - 1]} ${selectedYear}`}
          subtitle="Sube el archivo 'Movimiento de Comprobante RC' para ver el detalle de recaudos comisionables."
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <KpiCard
              title="Total Recaudado"
              value={formatCurrency(totals.totalRecaudado)}
              icon={DollarSign}
              type="info"
            />
            <KpiCard
              title="Comisionable"
              value={formatCurrency(totals.totalComisionable)}
              icon={CheckCircle}
              type="success"
            />
            <KpiCard
              title={`Mora >${DIAS_MORA_LIMITE}d`}
              value={formatCurrency(totals.totalExcluidoMora)}
              subtitle={`${totals.countMora} recibos`}
              icon={Clock}
              type="danger"
            />
            <KpiCard
              title="Marca excluida"
              value={formatCurrency(totals.totalExcluidoMarca)}
              subtitle={`${totals.countMarca} recibos`}
              icon={Tag}
              type="danger"
            />
            {totals.totalExcluidoIva > 0 && (
              <KpiCard
                title="IVA Descontado"
                value={formatCurrency(totals.totalExcluidoIva)}
                icon={Percent}
                type="warning"
              />
            )}
            <KpiCard
              title="% Comisionable"
              value={`${totals.pctComisionable.toFixed(1)}%`}
              icon={Percent}
              type="warning"
            />
          </div>

          {/* Vendedores table */}
          {loadingRecaudos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-emerald-600 animate-spin" />
              <span className="ml-2 text-sm text-slate-500">
                Cargando recaudos...
              </span>
            </div>
          ) : vendedorStats.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Sin resultados"
              subtitle="No se encontraron datos para esta carga."
            />
          ) : (
            <Card className="overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3 text-right">Total Recaudado</th>
                      <th className="px-4 py-3 text-right">Comisionable</th>
                      <th className="px-4 py-3 text-right">Excl. Mora</th>
                      <th className="px-4 py-3 text-right">Excl. Marca</th>
                      <th className="px-4 py-3 text-center">Recibos</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendedorStats.map((v) => {
                      const isExpanded = expandedVendedor === v.vendedor_codigo;
                      return (
                        <React.Fragment key={v.vendedor_codigo}>
                          <tr
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            {...clickableProps(() =>
                              setExpandedVendedor(
                                isExpanded ? null : v.vendedor_codigo,
                              ),
                            )}
                          >
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-900">
                                {vendedorNombres[v.vendedor_codigo] ||
                                  v.vendedor_codigo}
                              </span>
                              <span className="text-xs text-slate-400 ml-2">
                                #{v.vendedor_codigo}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700">
                              {formatFullCurrency(v.totalRecaudado)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                              {formatFullCurrency(v.totalComisionable)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-rose-500">
                              {v.excluidoMora > 0
                                ? formatFullCurrency(v.excluidoMora)
                                : "—"}
                              {v.countMora > 0 && (
                                <span className="block text-[10px] text-rose-400">
                                  {v.countMora} recibos
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-amber-600">
                              {v.excluidoMarca > 0
                                ? formatFullCurrency(v.excluidoMarca)
                                : "—"}
                              {v.countMarca > 0 && (
                                <span className="block text-[10px] text-amber-500">
                                  {v.countMarca} recibos
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-slate-500">
                              {v.items.length}
                            </td>
                            <td className="px-4 py-3">
                              {isExpanded ? (
                                <ChevronUp
                                  size={16}
                                  className="text-slate-400"
                                />
                              ) : (
                                <ChevronDown
                                  size={16}
                                  className="text-slate-400"
                                />
                              )}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="p-0 bg-slate-50">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-slate-400 uppercase font-bold border-b border-slate-200">
                                      <tr>
                                        <th className="px-6 py-2">Cliente</th>
                                        <th className="px-4 py-2">Factura</th>
                                        <th className="px-4 py-2">
                                          Fecha Abono
                                        </th>
                                        <th className="px-4 py-2 text-right">
                                          Base
                                        </th>
                                        <th className="px-4 py-2 text-right">
                                          Comisionable
                                        </th>
                                        <th className="px-4 py-2 text-center">
                                          Días
                                        </th>
                                        <th className="px-4 py-2 text-center">
                                          Estado
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {v.items
                                        .toSorted(
                                          (a, b) =>
                                            Number(b.valor_recaudo) -
                                            Number(a.valor_recaudo),
                                        )
                                        .map((item) => (
                                          <tr
                                            key={item.id}
                                            className="hover:bg-white"
                                          >
                                            <td className="px-6 py-2 truncate max-w-[180px]">
                                              {item.cliente_nombre ||
                                                item.cliente_nit}
                                            </td>
                                            <td className="px-4 py-2 font-mono">
                                              {item.factura}
                                            </td>
                                            <td className="px-4 py-2 font-mono">
                                              {item.fecha_abono}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">
                                              {formatFullCurrency(
                                                item.valor_recaudo,
                                              )}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">
                                              {(() => {
                                                const exclM = Number(
                                                  item.valor_excluido_marca ||
                                                    0,
                                                );
                                                if (
                                                  !item.aplica_comision &&
                                                  item.dias_mora >
                                                    DIAS_MORA_LIMITE
                                                )
                                                  return (
                                                    <span className="text-rose-500">
                                                      $ 0
                                                    </span>
                                                  );
                                                if (exclM > 0)
                                                  return (
                                                    <span className="text-emerald-700 font-bold">
                                                      {formatFullCurrency(
                                                        item.valor_recaudo -
                                                          exclM -
                                                          Number(
                                                            item.valor_iva || 0,
                                                          ),
                                                      )}
                                                    </span>
                                                  );
                                                return (
                                                  <span className="text-emerald-700 font-bold">
                                                    {formatFullCurrency(
                                                      item.valor_recaudo -
                                                        Number(
                                                          item.valor_iva || 0,
                                                        ),
                                                    )}
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <span
                                                className={
                                                  item.dias_mora >
                                                  DIAS_MORA_LIMITE
                                                    ? "text-rose-600 font-bold"
                                                    : "text-slate-600"
                                                }
                                              >
                                                {item.dias_mora}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              {(() => {
                                                const motivo = getMotivo(item);
                                                const exclMarca = Number(
                                                  item.valor_excluido_marca ||
                                                    0,
                                                );
                                                if (motivo === "mora")
                                                  return (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                                      Mora &gt;
                                                      {DIAS_MORA_LIMITE}d
                                                    </span>
                                                  );
                                                if (motivo === "parcial")
                                                  return (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                      Marca: -
                                                      {formatFullCurrency(
                                                        exclMarca,
                                                      )}
                                                    </span>
                                                  );
                                                if (motivo === "marca")
                                                  return (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                                      100% marca
                                                    </span>
                                                  );
                                                return (
                                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                                    Comisionable
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <RecaudoUploadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchRecaudosPeriodo(selectedYear, selectedMonth)}
      />
    </>
  );
}
