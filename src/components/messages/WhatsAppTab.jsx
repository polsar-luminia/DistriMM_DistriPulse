import React, { useState, useEffect } from "react";
import {
  Send,
  AlertTriangle,
  Loader,
  Smartphone,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "../dashboard/DashboardShared";
import { supabase } from "../../lib/supabase";

export default function WhatsAppTab() {
  const [stats, setStats] = useState({ today: 0, week: 0, loading: true });

  const isConfigured = Boolean(import.meta.env.VITE_META_PHONE_NUMBER_ID);
  const phoneNumberId = import.meta.env.VITE_META_PHONE_NUMBER_ID || "-";
  const phoneDisplay = import.meta.env.VITE_META_PHONE_DISPLAY || null;
  const isSandbox = import.meta.env.VITE_META_SANDBOX === "true";

  useEffect(() => {
    async function loadStats() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      try {
        const [{ count: todayCount }, { count: weekCount }] = await Promise.all([
          supabase
            .from("distrimm_mensajes_log")
            .select("*", { count: "exact", head: true })
            .eq("estado", "enviado")
            .gte("created_at", todayStart.toISOString()),
          supabase
            .from("distrimm_mensajes_log")
            .select("*", { count: "exact", head: true })
            .eq("estado", "enviado")
            .gte("created_at", weekStart.toISOString()),
        ]);
        setStats({ today: todayCount ?? 0, week: weekCount ?? 0, loading: false });
      } catch (error) {
        if (import.meta.env.DEV) console.error("[WhatsAppTab] loadStats failed:", error);
        setStats({ today: 0, week: 0, loading: false });
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-4">
      {isSandbox && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 flex-1 min-w-0">
            <span className="font-bold">Modo sandbox - </span>
            Solo puede enviar a numeros verificados en Meta for Developers. Numero activo:{" "}
            <span className="font-mono font-bold">+57 318 322 4021</span>
          </p>
        </div>
      )}

      <Card className="p-7">
        <div className="flex items-start gap-5">
          <div className={cn("p-4 rounded-2xl shrink-0", isConfigured ? "bg-emerald-50" : "bg-amber-50")}>
            <Smartphone size={30} className={isConfigured ? "text-emerald-600" : "text-amber-500"} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">WhatsApp Business</p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">Meta Cloud API</p>
              </div>
              <span
                className={cn(
                  "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold",
                  isConfigured
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                )}
              >
                {isConfigured ? "● Configurado" : "● No configurado"}
              </span>
            </div>

            {isConfigured && (
              <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-4">
                {phoneDisplay && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Numero de telefono</p>
                    <p className="font-mono font-bold text-slate-700">{phoneDisplay}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 mb-1">Phone Number ID</p>
                  <p className="font-mono font-semibold text-slate-600 text-sm truncate">{phoneNumberId}</p>
                </div>
              </div>
            )}

            {!isConfigured && (
              <p className="mt-3 text-xs text-amber-600">
                Configura{" "}
                <code className="bg-amber-50 px-1 rounded font-mono">VITE_META_PHONE_NUMBER_ID</code>{" "}
                en .env para activar el envio de mensajes.
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Enviados hoy</p>
              {stats.loading ? (
                <Loader size={24} className="animate-spin text-slate-300" />
              ) : (
                <p className="text-4xl font-black text-slate-800">
                  {stats.today.toLocaleString("es-CO")}
                </p>
              )}
            </div>
            <div className="p-3.5 rounded-2xl bg-green-50">
              <Send size={22} className="text-green-500" />
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Enviados esta semana</p>
              {stats.loading ? (
                <Loader size={24} className="animate-spin text-slate-300" />
              ) : (
                <p className="text-4xl font-black text-slate-800">
                  {stats.week.toLocaleString("es-CO")}
                </p>
              )}
            </div>
            <div className="p-3.5 rounded-2xl bg-blue-50">
              <Zap size={22} className="text-blue-500" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
