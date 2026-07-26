import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { sileo } from "sileo";
import { Lock, User, ArrowRight } from "lucide-react";
import logoDistriMM from "../assets/DistriMMLogo.png";

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        sileo.error({ title: "Credenciales inválidas" });
      } else {
        sileo.success({ title: "Bienvenido a DistriMM" });
      }
    } catch {
      sileo.error({ title: "Error al iniciar sesión" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          {/* Fondo blanco: el logo (fondo blanco) se integra directo, sin card */}
          <img
            src={logoDistriMM}
            alt="Almacén Agropecuario DistriMM"
            className="h-24 w-auto object-contain mx-auto mb-4"
          />
          <p className="text-sm text-indigo-700/80 tracking-widest uppercase mt-2 font-mono">
            Gestión Empresarial
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg shadow-slate-200/60">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Correo electrónico
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User
                      size={20}
                      className="text-slate-400 group-focus-within:text-indigo-600 transition-colors"
                    />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 block w-full bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-base placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all py-3.5"
                    placeholder="usuario@correo.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock
                      size={20}
                      className="text-slate-400 group-focus-within:text-indigo-600 transition-colors"
                    />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 block w-full bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-base placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all py-3.5"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base py-4 px-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Iniciar Sesión <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-8 space-y-1">
          <p className="text-[12px] text-slate-400 font-semibold uppercase tracking-widest">
            Powered By{" "}
            <a
              href="https://hola.luminiatech.digital/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-extrabold text-emerald-600 hover:text-emerald-500 transition-colors"
            >
              LuminIA
            </a>
          </p>
          <p className="text-[10px] text-slate-400">
            Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
