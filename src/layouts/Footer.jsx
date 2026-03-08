import React from "react";

const Footer = () => {
  return (
    <footer className="mt-auto py-6 border-t border-slate-200 bg-white/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-400">Powered by</span>
          <a
            href="https://hola.luminiatech.digital"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent tracking-tight hover:opacity-90"
          >
            LuminIA
          </a>
        </div>
        <div className="text-xs text-slate-400 font-medium">
          &copy; {new Date().getFullYear()} DistriPulse Analytics. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;

