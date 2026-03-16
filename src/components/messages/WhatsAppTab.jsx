/**
 * @fileoverview WhatsAppTab - Embedded Signup + instance status + send stats.
 * Connects the user's WhatsApp Business via Meta Embedded Signup (Coexistence),
 * reads instance state from distrimm_whatsapp_instances, and shows send stats.
 * @module components/messages/WhatsAppTab
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Send,
  AlertTriangle,
  Loader,
  Smartphone,
  Zap,
  Link,
  Unlink,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "../dashboard/DashboardShared";
import { Button } from "../ui/button";
import { supabase } from "../../lib/supabase";
import { sileo } from "sileo";

// ============================================================================
// FACEBOOK SDK LOADER
// ============================================================================

/**
 * Loads the Facebook JS SDK dynamically. Resolves when FB is ready.
 * Safe to call multiple times — only loads once.
 * @returns {Promise<void>}
 */
function loadFacebookSDK() {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    // If script is already loading, wait for it
    if (document.getElementById("facebook-jssdk")) {
      const check = setInterval(() => {
        if (window.FB) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      // Timeout after 15s
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Facebook SDK timeout"));
      }, 15000);
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: import.meta.env.VITE_META_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve();
    };

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () =>
      reject(new Error("No se pudo cargar el SDK de Facebook"));
    document.head.appendChild(script);
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WhatsAppTab() {
  const [stats, setStats] = useState({ today: 0, week: 0, loading: true });
  const [instance, setInstance] = useState(null);
  const [loadingInstance, setLoadingInstance] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  // Ref to store signup data from message listener
  const signupDataRef = useRef(null);

  const hasAppId = Boolean(import.meta.env.VITE_META_APP_ID);
  const hasConfigId = Boolean(import.meta.env.VITE_META_CONFIG_ID);
  const isConfigured = hasAppId && hasConfigId;

  // ────────────────────────────────────────────────────────────────────────
  // Load Facebook SDK
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConfigured) return;

    let cancelled = false;
    loadFacebookSDK()
      .then(() => {
        if (!cancelled) setSdkReady(true);
      })
      .catch((err) => {
        if (!cancelled && import.meta.env.DEV) {
          console.error("[WhatsAppTab] FB SDK load failed:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isConfigured]);

  // ────────────────────────────────────────────────────────────────────────
  // Load instance from DB
  // ────────────────────────────────────────────────────────────────────────
  const loadInstance = useCallback(async () => {
    setLoadingInstance(true);
    try {
      const { data, error } = await supabase
        .from("distrimm_whatsapp_instances")
        .select(
          "id, waba_id, phone_number_id, phone_display, business_name, status, coexistence, created_at",
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setInstance(data);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[WhatsAppTab] loadInstance failed:", err);
      setInstance(null);
    } finally {
      setLoadingInstance(false);
    }
  }, []);

  useEffect(() => {
    loadInstance();
  }, [loadInstance]);

  // ────────────────────────────────────────────────────────────────────────
  // Load send stats
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadStats() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

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
      } catch (error) {
        if (import.meta.env.DEV)
          console.error("[WhatsAppTab] loadStats failed:", error);
        setStats({ today: 0, week: 0, loading: false });
      }
    }
    loadStats();
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // WA_EMBEDDED_SIGNUP message listener
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleMessage(event) {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      )
        return;

      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type !== "WA_EMBEDDED_SIGNUP") return;

        if (data.event === "FINISH") {
          const { phone_number_id, waba_id } = data.data || {};
          signupDataRef.current = { phone_number_id, waba_id };
          if (import.meta.env.DEV) {
            console.log("[WhatsAppTab] Embedded Signup FINISH:", {
              phone_number_id,
              waba_id,
            });
          }
        } else if (data.event === "CANCEL") {
          signupDataRef.current = null;
          sileo.info("Conexion de WhatsApp cancelada.");
          setConnecting(false);
        } else if (data.event === "ERROR") {
          signupDataRef.current = null;
          sileo.error(
            "Error durante la conexion de WhatsApp. Intenta de nuevo.",
          );
          setConnecting(false);
        }
      } catch {
        // Ignore non-JSON messages from other iframes
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // Launch Embedded Signup
  // ────────────────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!sdkReady || !window.FB) {
      sileo.error("El SDK de Facebook no esta listo. Recarga la pagina.");
      return;
    }

    setConnecting(true);
    signupDataRef.current = null;

    const loginConfig = {
      config_id: import.meta.env.VITE_META_CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        feature: "whatsapp_embedded_signup",
        featureType: "whatsapp_business_app_onboard",
        sessionInfoVersion: 3,
      },
    };

    // Add optional solution ID
    const solutionId = import.meta.env.VITE_META_SOLUTION_ID;
    if (solutionId) {
      loginConfig.extras.setup = { solutionID: solutionId };
    }

    window.FB.login((response) => {
      // FB.login no acepta async callbacks — manejar la promesa internamente
      (async () => {
        try {
          if (response.status !== "connected" || !response.authResponse?.code) {
            sileo.error("No se obtuvo autorizacion de Facebook.");
            setConnecting(false);
            return;
          }

          const code = response.authResponse.code;

          // Get signup data from the message listener
          const signupData = signupDataRef.current;
          if (!signupData?.waba_id || !signupData?.phone_number_id) {
            sileo.error(
              "No se recibio la informacion de WhatsApp Business. Intenta de nuevo.",
            );
            setConnecting(false);
            return;
          }

          // Send to proxy-embedded-signup Edge Function
          const { data, error } = await supabase.functions.invoke(
            "proxy-embedded-signup",
            {
              body: {
                code,
                waba_id: signupData.waba_id,
                phone_number_id: signupData.phone_number_id,
              },
            },
          );

          if (error) throw error;

          if (data?.data) {
            setInstance(data.data);
            sileo.success("WhatsApp Business conectado exitosamente.");
          } else {
            throw new Error("Respuesta inesperada del servidor.");
          }
        } catch (err) {
          if (import.meta.env.DEV)
            console.error("[WhatsAppTab] Embedded Signup error:", err);
          sileo.error(`Error al conectar WhatsApp: ${err.message}`);
        } finally {
          setConnecting(false);
          signupDataRef.current = null;
        }
      })();
    }, loginConfig);
  }, [sdkReady]);

  // ────────────────────────────────────────────────────────────────────────
  // Disconnect instance
  // ────────────────────────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    if (!instance?.id) return;

    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from("distrimm_whatsapp_instances")
        .update({ status: "disconnected" })
        .eq("id", instance.id);

      if (error) throw error;

      setInstance(null);
      sileo.success("WhatsApp Business desconectado.");
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[WhatsAppTab] disconnect error:", err);
      sileo.error("Error al desconectar. Intenta de nuevo.");
    } finally {
      setDisconnecting(false);
    }
  }, [instance?.id]);

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  const isConnected = instance?.status === "active";

  return (
    <div className="space-y-4">
      {/* Missing configuration warning */}
      {!isConfigured && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 flex-1 min-w-0">
            <span className="font-bold">Configuracion incompleta - </span>
            Configura{" "}
            <code className="bg-amber-50 px-1 rounded font-mono">
              VITE_META_APP_ID
            </code>{" "}
            y{" "}
            <code className="bg-amber-50 px-1 rounded font-mono">
              VITE_META_CONFIG_ID
            </code>{" "}
            en .env para habilitar Embedded Signup.
          </p>
        </div>
      )}

      {/* Connection card */}
      <Card className="p-7">
        <div className="flex items-start gap-5">
          <div
            className={cn(
              "p-4 rounded-2xl shrink-0",
              isConnected ? "bg-emerald-50" : "bg-amber-50",
            )}
          >
            <Smartphone
              size={30}
              className={isConnected ? "text-emerald-600" : "text-amber-500"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  WhatsApp Business
                </p>
                <p className="text-2xl font-black text-slate-800 mt-0.5">
                  {isConnected ? "Conectado" : "Meta Cloud API"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold",
                  isConnected
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {loadingInstance ? (
                  <Loader size={12} className="animate-spin inline" />
                ) : isConnected ? (
                  <>
                    <CheckCircle2 size={12} className="inline mr-1" />
                    Conectado
                  </>
                ) : (
                  <>
                    <XCircle size={12} className="inline mr-1" />
                    Sin conexion
                  </>
                )}
              </span>
            </div>

            {/* Connected state — show instance info */}
            {isConnected && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-4">
                  {instance.phone_display && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">
                        Numero de telefono
                      </p>
                      <p className="font-mono font-bold text-slate-700">
                        {instance.phone_display}
                      </p>
                    </div>
                  )}
                  {instance.business_name && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Negocio</p>
                      <p className="font-semibold text-slate-700 truncate">
                        {instance.business_name}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400 mb-1">
                      Phone Number ID
                    </p>
                    <p className="font-mono font-semibold text-slate-600 text-sm truncate">
                      {instance.phone_number_id}
                    </p>
                  </div>
                  {instance.coexistence && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Modo</p>
                      <p className="font-semibold text-emerald-600 text-sm">
                        Coexistencia
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadInstance}
                    disabled={loadingInstance}
                  >
                    <RefreshCw
                      size={14}
                      className={loadingInstance ? "animate-spin" : ""}
                    />
                    Actualizar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <Loader size={14} className="animate-spin" />
                    ) : (
                      <Unlink size={14} />
                    )}
                    Desconectar
                  </Button>
                </div>
              </div>
            )}

            {/* Not connected — show connect button */}
            {!isConnected && !loadingInstance && isConfigured && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-3">
                  Conecta tu numero de WhatsApp Business para enviar mensajes
                  automatizados. Tu app de WhatsApp seguira funcionando
                  normalmente (modo coexistencia).
                </p>
                <Button
                  onClick={handleConnect}
                  disabled={connecting || !sdkReady}
                >
                  {connecting ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Link size={16} />
                  )}
                  {connecting ? "Conectando..." : "Conectar WhatsApp"}
                </Button>
              </div>
            )}

            {/* Loading state */}
            {loadingInstance && (
              <div className="mt-5 pt-5 border-t border-slate-100 flex items-center gap-2">
                <Loader size={16} className="animate-spin text-slate-400" />
                <p className="text-xs text-slate-400">
                  Cargando estado de conexion...
                </p>
              </div>
            )}
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
