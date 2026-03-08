import { cn } from "@/lib/utils";

export const Card = ({ children, className = "", ...props }) => (
  <div
    className={cn(
      "bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 rounded-2xl p-5 md:p-6",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
