/* eslint-disable react-refresh/only-export-components */
import { createContext, use } from "react";

const TableContext = createContext(null);

export function TableProvider({ children, value }) {
  return <TableContext value={value}>{children}</TableContext>;
}

export function useTableContext() {
  const ctx = use(TableContext);
  if (!ctx) throw new Error("useTableContext must be used within TableProvider");
  return ctx;
}
