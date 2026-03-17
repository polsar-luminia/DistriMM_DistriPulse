import { useState } from "react";
import { formatNumber } from "../../../utils/formatters";

/**
 * Input numérico que muestra separador de miles (es-CO) cuando no está en foco.
 * Al enfocar, muestra el valor raw para edición cómoda.
 */
export default function CurrencyInput({
  value,
  onChange,
  className,
  placeholder = "0",
  ...props
}) {
  const [focused, setFocused] = useState(false);

  const numericValue = parseFloat(value) || 0;

  return (
    <input
      type={focused ? "number" : "text"}
      className={className}
      value={focused ? numericValue || "" : formatNumber(numericValue)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={!focused && false}
      {...props}
    />
  );
}
