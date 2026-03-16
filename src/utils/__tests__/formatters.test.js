import {
  formatCurrency,
  formatFullCurrency,
  formatDateUTC,
  formatDateShort,
  formatPercentage,
  formatNumber,
  truncateText,
  getShortName,
} from "../formatters";

describe("formatCurrency", () => {
  test("returns '$0' for null", () => {
    expect(formatCurrency(null)).toBe("$0");
  });
  test("returns '$0' for undefined", () => {
    expect(formatCurrency(undefined)).toBe("$0");
  });
  test("returns '$0' for NaN", () => {
    expect(formatCurrency(NaN)).toBe("$0");
  });
  test("returns '$0' for Infinity", () => {
    expect(formatCurrency(Infinity)).toBe("$0");
  });
  test("formats positive number with Colombian separators", () => {
    const result = formatCurrency(1500000);
    expect(result).toContain("1.500.000");
  });
  test("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });
  test("formats negative number", () => {
    const result = formatCurrency(-500000);
    expect(result).toContain("500.000");
  });
});

describe("formatFullCurrency", () => {
  test("returns '$ 0' (with space) for null", () => {
    expect(formatFullCurrency(null)).toBe("$ 0");
  });
  test("returns '$ 0' for NaN", () => {
    expect(formatFullCurrency(NaN)).toBe("$ 0");
  });
  test("formats positive number", () => {
    const result = formatFullCurrency(2500000);
    expect(result).toContain("2.500.000");
  });
});

describe("formatDateUTC", () => {
  test("returns 'N/A' for null", () => {
    expect(formatDateUTC(null)).toBe("N/A");
  });
  test("returns 'N/A' for undefined", () => {
    expect(formatDateUTC(undefined)).toBe("N/A");
  });
  test("returns 'N/A' for empty string", () => {
    expect(formatDateUTC("")).toBe("N/A");
  });
  test("formats ISO date to Colombian dd/MM/yyyy", () => {
    const result = formatDateUTC("2024-01-15");
    expect(result).toBe("15/01/2024");
  });
  test("formats end of year correctly", () => {
    const result = formatDateUTC("2024-12-31");
    expect(result).toBe("31/12/2024");
  });
});

describe("formatDateShort", () => {
  test("returns empty string for falsy", () => {
    expect(formatDateShort(null)).toBe("");
    expect(formatDateShort("")).toBe("");
  });
  test("formats date without year", () => {
    const result = formatDateShort("2024-06-15");
    expect(result).toBe("15/06");
  });
});

describe("formatPercentage", () => {
  test("returns '0%' for null", () => {
    expect(formatPercentage(null)).toBe("0%");
  });
  test("returns '0%' for undefined", () => {
    expect(formatPercentage(undefined)).toBe("0%");
  });
  test("returns '0%' for NaN", () => {
    expect(formatPercentage(NaN)).toBe("0%");
  });
  test("formats with default 1 decimal", () => {
    expect(formatPercentage(75.456)).toBe("75.5%");
  });
  test("formats with custom decimals", () => {
    expect(formatPercentage(75.456, 2)).toBe("75.46%");
  });
  test("formats zero", () => {
    expect(formatPercentage(0)).toBe("0.0%");
  });
  test("formats 100%", () => {
    expect(formatPercentage(100)).toBe("100.0%");
  });
});

describe("formatNumber", () => {
  test("returns '0' for NaN", () => {
    expect(formatNumber(NaN)).toBe("0");
  });
  test("returns '0' for Infinity", () => {
    expect(formatNumber(Infinity)).toBe("0");
  });
  test("returns '0' for null", () => {
    expect(formatNumber(null)).toBe("0");
  });
  test("formats with Colombian separators", () => {
    const result = formatNumber(1500000);
    expect(result).toContain("1.500.000");
  });
});

describe("truncateText", () => {
  test("returns empty string for null", () => {
    expect(truncateText(null)).toBe("");
  });
  test("returns unchanged text when under maxLength", () => {
    expect(truncateText("short", 20)).toBe("short");
  });
  test("truncates and adds ellipsis", () => {
    expect(truncateText("this is a very long text that should be truncated", 10)).toBe("this is a ...");
  });
  test("uses default maxLength of 20", () => {
    const text = "twelve345678901234567890extra";
    const result = truncateText(text);
    expect(result).toBe("twelve34567890123456...");
    expect(result.length).toBe(23); // 20 + "..."
  });
});

describe("getShortName", () => {
  test("returns empty string for null", () => {
    expect(getShortName(null)).toBe("");
  });
  test("returns empty string for undefined", () => {
    expect(getShortName(undefined)).toBe("");
  });
  test("returns first 2 words", () => {
    expect(getShortName("Juan Carlos Perez Rodriguez")).toBe("Juan Carlos");
  });
  test("returns single word unchanged", () => {
    expect(getShortName("Juan")).toBe("Juan");
  });
  test("returns exactly 2 words for 2-word name", () => {
    expect(getShortName("Juan Perez")).toBe("Juan Perez");
  });
});
