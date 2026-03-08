import React, { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./DashboardShared";
import { formatCurrency } from "../../utils/formatters";
import { supabase } from "../../lib/supabase";
import { Users } from "lucide-react";

/**
 * Top 3 vendors mini cards showing cartera total and % vencida health bar.
 * Self-contained: fetches distrimm_vendedores for real names.
 * @param {Object} props
 * @param {Object} props.vendedores - { stats: Array, uniqueCodes: Array, count: number } from context
 * @returns {JSX.Element|null}
 */
export default function VendedoresKpiCards({ vendedores }) {
  const vendedorStats = vendedores?.stats;
  const [nameMap, setNameMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchNames() {
      try {
        setLoading(true);
        setError(null);
        const { data, error: dbError } = await supabase
          .from("distrimm_vendedores")
          .select("codigo, nombre")
          .abortSignal(controller.signal);

        if (dbError) throw dbError;

        const map = {};
        for (const v of data || []) {
          map[String(v.codigo)] = v.nombre;
        }
        if (!controller.signal.aborted) {
          setNameMap(map);
        }
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        if (import.meta.env.DEV) console.error("[VendedoresKpiCards] Error fetching names:", err);
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchNames();
    return () => controller.abort();
  }, []);

  // Filter out "Sin Asignar" — only show real vendors with a code
  const realVendors = useMemo(
    () => (vendedorStats || []).filter((v) => v.codigo && v.codigo !== "Sin Asignar"),
    [vendedorStats]
  );

  if (realVendors.length === 0) {
    return null;
  }

  const top3 = realVendors.slice(0, 3);

  if (loading) {
    return (
      <section className="animate-fade-up">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-3 w-20 bg-navy-100 rounded mb-3" />
              <div className="h-6 w-28 bg-navy-100 rounded mb-2" />
              <div className="h-2 w-full bg-navy-50 rounded" />
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="animate-fade-up">
        <Card className="text-center py-4">
          <p className="text-[11px] text-rose-500 font-medium">
            Error cargando vendedores: {error}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-sky-50 text-sky-500">
          <Users size={16} strokeWidth={1.8} />
        </div>
        <h3 className="text-[11px] font-semibold text-navy-400 uppercase tracking-[0.08em]">
          Top Vendedores por Cartera
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {top3.map((v) => {
          const name =
            nameMap[String(v.codigo)] ||
            `Vendedor ${v.codigo}`;
          const healthPct = Math.max(0, Math.min(100, 100 - (v.pctVencida || 0)));

          return (
            <Card
              key={v.codigo}
              className="relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-sky-300 opacity-60" />
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em] truncate">
                {name}
              </p>
              <p className="text-xl font-bold font-mono text-navy-900 tracking-tight mt-1">
                {formatCurrency(v.totalCartera || 0)}
              </p>
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[9px] font-medium mb-1">
                  <span className="text-navy-400">Salud</span>
                  <span
                    className={
                      healthPct >= 70
                        ? "text-emerald-500"
                        : healthPct >= 40
                          ? "text-amber-500"
                          : "text-rose-500"
                    }
                  >
                    {healthPct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-navy-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500",
                      healthPct >= 70
                        ? "bg-emerald-400"
                        : healthPct >= 40
                          ? "bg-amber-400"
                          : "bg-rose-400"
                    )}
                    style={{ width: `${healthPct}%` }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
