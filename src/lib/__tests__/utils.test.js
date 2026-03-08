import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn()", () => {
  it("combina múltiples clases", () => {
    expect(cn("text-red-500", "bg-white")).toBe("text-red-500 bg-white");
  });

  it("maneja valores condicionales", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe(
      "base active"
    );
  });

  it("resuelve conflictos de Tailwind (último gana)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("maneja undefined, null, y false", () => {
    expect(cn("base", undefined, null, false, "extra")).toBe("base extra");
  });

  it("maneja strings vacíos", () => {
    expect(cn("", "text-sm", "")).toBe("text-sm");
  });

  it("maneja objetos condicionales (clsx style)", () => {
    expect(cn({ "bg-red-500": true, "bg-blue-500": false })).toBe(
      "bg-red-500"
    );
  });

  it("maneja arrays", () => {
    expect(cn(["p-4", "text-sm"])).toBe("p-4 text-sm");
  });

  it("retorna string vacío sin argumentos", () => {
    expect(cn()).toBe("");
  });
});
