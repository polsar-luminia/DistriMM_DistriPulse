import { timeAgo, hoursAgo } from "../timeAgo";

const NOW = new Date("2025-06-15T12:00:00Z");

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns 'Nunca' for null", () => {
    expect(timeAgo(null)).toBe("Nunca");
  });
  test("returns 'Nunca' for empty string", () => {
    expect(timeAgo("")).toBe("Nunca");
  });
  test("returns 'Hace menos de un minuto' for 30 seconds ago", () => {
    const date = new Date(NOW.getTime() - 30 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace menos de un minuto");
  });
  test("returns singular 'minuto' for 1 minute ago", () => {
    const date = new Date(NOW.getTime() - 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 1 minuto");
  });
  test("returns plural 'minutos' for 5 minutes ago", () => {
    const date = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 5 minutos");
  });
  test("returns singular 'hora' for 1 hour ago", () => {
    const date = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 1 hora");
  });
  test("returns plural 'horas' for 3 hours ago", () => {
    const date = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 3 horas");
  });
  test("returns singular 'día' for 1 day ago", () => {
    const date = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 1 día");
  });
  test("returns plural 'días' for 15 days ago", () => {
    const date = new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 15 días");
  });
  test("returns singular 'mes' for ~31 days ago", () => {
    const date = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 1 mes");
  });
  test("returns plural 'meses' for ~180 days ago", () => {
    const date = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 6 meses");
  });
  test("returns plural 'años' for ~730 days ago", () => {
    const date = new Date(NOW.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(date)).toBe("Hace 2 años");
  });
});

describe("hoursAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns Infinity for null", () => {
    expect(hoursAgo(null)).toBe(Infinity);
  });
  test("returns Infinity for undefined", () => {
    expect(hoursAgo(undefined)).toBe(Infinity);
  });
  test("returns ~1.0 for 1 hour ago", () => {
    const date = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    expect(hoursAgo(date)).toBeCloseTo(1.0, 1);
  });
  test("returns ~24.0 for 1 day ago", () => {
    const date = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(hoursAgo(date)).toBeCloseTo(24.0, 1);
  });
});
