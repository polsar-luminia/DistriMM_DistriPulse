/**
 * @fileoverview PlantillasTab - Message template management (CRUD).
 * @module components/messages/PlantillasTab
 */

import React, { useState } from "react";
import {
  FileText,
  Plus,
  Save,
  Trash2,
  Loader,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { Card } from "../dashboard/DashboardShared";

export default function PlantillasTab({ messaging }) {
  const [editing, setEditing] = useState(null); // null or template object
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editing?.nombre || !editing?.contenido) {
      sileo.error({ title: "Complete nombre y contenido" });
      return;
    }
    setSaving(true);
    const { error } = await messaging.saveTemplate(editing);
    setSaving(false);
    if (error) {
      sileo.error({ title: "Error guardando plantilla" });
    } else {
      sileo.success({ title: "Plantilla guardada" });
      setEditing(null);
    }
  };

  const handleDelete = async (id) => {
    const { success } = await messaging.removeTemplate(id);
    if (success) {
      sileo.success({ title: "Plantilla eliminada" });
    } else {
      sileo.error({ title: "Error eliminando plantilla" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <FileText size={16} className="text-indigo-600" />
            Plantillas de Mensaje
          </h3>
          <button
            onClick={() =>
              setEditing({
                nombre: "",
                tipo: "recordatorio",
                contenido: "",
                variables: [],
              })
            }
            className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"
          >
            <Plus size={12} /> Nueva
          </button>
        </div>
      </Card>

      {/* Edit form */}
      {editing && (
        <Card className="p-5 space-y-4 border-indigo-200">
          <h4 className="text-xs font-bold text-indigo-600 uppercase">
            {editing.id ? "Editar Plantilla" : "Nueva Plantilla"}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                Nombre
              </label>
              <input
                type="text"
                value={editing.nombre}
                onChange={(e) =>
                  setEditing((p) => ({ ...p, nombre: e.target.value }))
                }
                placeholder="Recordatorio Cobranza..."
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                Tipo
              </label>
              <select
                value={editing.tipo}
                onChange={(e) =>
                  setEditing((p) => ({ ...p, tipo: e.target.value }))
                }
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500"
              >
                <option value="recordatorio">Recordatorio</option>
                <option value="promocional">Promocional</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Contenido (use {"{{variable}}"} para placeholders)
            </label>
            <textarea
              value={editing.contenido}
              onChange={(e) =>
                setEditing((p) => ({ ...p, contenido: e.target.value }))
              }
              rows={8}
              placeholder={`Hola {{cliente}},\n\nLe recordamos que tiene facturas pendientes:\n\n{{detalle_facturas}}\n\nTotal: {{total}}\n\nGracias.`}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-mono"
            />
          </div>

          {/* Quick variable buttons */}
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] font-bold text-slate-400 mr-2">
              Insertar:
            </span>
            {["cliente", "detalle_facturas", "total", "municipio"].map((v) => (
              <button
                key={v}
                onClick={() =>
                  setEditing((p) => ({
                    ...p,
                    contenido: p.contenido + `{{${v}}}`,
                  }))
                }
                className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 hover:bg-indigo-100 font-mono"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? (
                <Loader size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              Guardar
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {/* Template List */}
      {messaging.loadingTemplates ? (
        <Card className="p-10 flex items-center justify-center">
          <Loader size={24} className="animate-spin text-slate-300" />
        </Card>
      ) : (
        <div className="space-y-2">
          {messaging.templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-bold text-slate-800">
                      {t.nombre}
                    </p>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        t.tipo === "recordatorio"
                          ? "bg-blue-50 text-blue-600"
                          : t.tipo === "promocional"
                            ? "bg-purple-50 text-purple-600"
                            : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {t.tipo}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">
                    {t.contenido}
                  </p>
                  {t.variables?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.variables.map((v) => (
                        <span
                          key={v}
                          className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono"
                        >
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditing({ ...t })}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <FileText size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
