/**
 * Expandable/collapsible card section with icon and title.
 * Uses the children pattern for flexible content composition.
 * @module components/cfo/CollapsibleSection
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "../dashboard/DashboardShared";

/**
 * @param {{ title: string, icon: import("lucide-react").LucideIcon, children: React.ReactNode, defaultOpen?: boolean }} props
 */
export default function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-1"
      >
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Icon size={16} className="text-indigo-600" />
          </div>
          <h3 className="font-bold text-sm text-slate-800">{title}</h3>
        </div>
        {isOpen ? (
          <ChevronUp size={16} className="text-slate-400" />
        ) : (
          <ChevronDown size={16} className="text-slate-400" />
        )}
      </button>
      {isOpen && <div className="mt-3 pt-3 border-t border-slate-100">{children}</div>}
    </Card>
  );
}
