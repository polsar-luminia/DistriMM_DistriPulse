/**
 * @fileoverview WhatsAppTab - estado del canal y estadísticas de envío.
 *
 * El número de WhatsApp es uno solo para toda la organización y su configuración
 * (META_PHONE_NUMBER_ID y META_ACCESS_TOKEN) vive en el entorno del VPS, no en
 * base de datos ni en el navegador. Por eso esta pestaña ya no conecta ni
 * desconecta nada: solo informa.
 *
 * @module components/messages/WhatsAppTab
 */

import { useState, useEffect } from "react";
import { Send, Loader, Smartphone, Zap, CheckCircle2 } from "lucide-react";
import { Card } from "../dashboard/DashboardShared";
import { supabase } from "../../lib/supabase";

// Solo para mostrar. El número real con el que se envía lo decide el servidor
// (META_PHONE_NUMBER_ID en /etc/distrimm/functions.env); esto es una etiqueta.
const NUMERO_VISIBLE = import.meta.env.VITE_WHATSAPP_NUMERO || "";

export default function WhatsAppTab() {
  const [stats, setStats] = useState({ today: 0, week: 0, loading: true });

  // ────────────────────────────────────────────────────────────────────────
  // Load send stats
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadStats() {
      // Calcular midnight Colombia (UTC-5) para counters consistentes
      const COLOMBIA_OFFSET_MINS = -5 * 60;
      const now = new Date();
      const colombiaMs =
        now.getTime() +
        (now.getTimezoneOffset() + COLOMBIA_OFFSET_MINS) * 60000;
      const colombiaMidnight = new Date(colombiaMs);
      colombiaMidnight.setHours(0, 0, 0, 0);
      const todayStart = new Date(
        colombiaMidnight.getTime() -
          (now.getTimezoneOffset() + COLOMBIA_OFFSET_MINS) * 60000,
      );

      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      try {
        const [{ count: todayCount }, { count: weekCount }] = await Promise.all(
          [
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
          ],
        );
        setStats({
          today: todayCount ?? 0,
          week: weekCount ?? 0,
          loading: false,
        });
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("[WhatsAppTab] loadStats failed:", err);
        setStats({ today: 0, week: 0, loading: false });
      }
    }

    loadStats();
  }, []);

  return (
    <div className="space-y-4">
      {/* Estado del canal */}
      <Card className="p-7">
        <div className="flex items-start gap-5">
          <div className="p-4 rounded-2xl shrink-0 bg-emerald-50">
            <Smartphone size={30} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  WhatsApp Business
                </p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">
                  Meta Cloud API
                </p>
              </div>
              <span className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={12} className="inline mr-1" />
                Canal principal
              </span>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100">
              {NUMERO_VISIBLE && (
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-1">
                    Número de envío
                  </p>
                  <p className="font-mono font-bold text-slate-700">
                    {NUMERO_VISIBLE}
                  </p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                El número y el token están configurados en el servidor. No hay
                nada que conectar desde aquí: si faltaran, el envío fallaría
                indicando el motivo.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Enviados hoy
              </p>
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Enviados esta semana
              </p>
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
