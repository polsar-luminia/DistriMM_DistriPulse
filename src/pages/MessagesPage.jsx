/**
 * @fileoverview Messages Page - Centralized WhatsApp messaging with Lote system.
 * Tabs: Nuevo Lote, Historial Lotes, Plantillas, WhatsApp.
 * @module pages/MessagesPage
 */

import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import { useMessaging } from "../hooks/useMessaging";
import { TABS, LoteProgressBadge } from "../components/messages/MessagesShared";
import NuevoLoteTab from "../components/messages/NuevoLoteTab";
import HistorialLotesTab from "../components/messages/HistorialTab";
import PlantillasTab from "../components/messages/PlantillasTab";
import WhatsAppTab from "../components/messages/WhatsAppTab";

export default function MessagesPage() {
  const context = useOutletContext();
  const { markRemindersAsSent, currentLoadId = null } = context || {};

  const [activeTab, setActiveTab] = useState("nuevo_lote");

  const messaging = useMessaging({ markRemindersAsSent });

  // Load lotes on mount and when switching to historial tab
  useEffect(() => {
    if (activeTab === "historial") {
      messaging.refreshLotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg shadow-indigo-900/5 border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-600/20">
              <MessageCircle size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                Centro de Mensajes
              </h1>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Envíe recordatorios y promociones por WhatsApp en lotes
              </p>
            </div>
          </div>

          {/* Active lote indicator */}
          {messaging.activeLote && messaging.activeLote.estado === "en_proceso" && (
            <LoteProgressBadge lote={messaging.activeLote} />
          )}
        </div>

        {/* Tabs */}
        <div className="flex mt-6 bg-slate-100 rounded-xl p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                activeTab === tab.id
                  ? "bg-white shadow-md text-indigo-600"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "nuevo_lote" && (
        <NuevoLoteTab currentLoadId={currentLoadId} messaging={messaging} />
      )}
      {activeTab === "historial" && <HistorialLotesTab messaging={messaging} />}
      {activeTab === "plantillas" && <PlantillasTab messaging={messaging} />}
      {activeTab === "whatsapp" && <WhatsAppTab />}
    </div>
  );
}
