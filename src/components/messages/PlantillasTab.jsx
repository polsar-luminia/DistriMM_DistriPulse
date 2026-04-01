import React from "react";
import { FileText, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "../dashboard/DashboardShared";

export default function PlantillasTab({ messaging }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <FileText size={16} className="text-indigo-600" />
            Plantillas de Mensaje
          </h3>
        </div>
      </Card>

      {/* Template List */}
      {messaging.loadingTemplates ? (
        <Card className="p-10 flex items-center justify-center">
          <Loader size={24} className="animate-spin text-slate-300" />
        </Card>
      ) : (
        <div className="space-y-2">
          {messaging.templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start gap-3">
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
                            : "bg-slate-100 text-slate-500",
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
