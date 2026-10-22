export type TestWindowStatus = "draft" | "upcoming" | "open" | "closed";

export function testWindowStatus(test: {
  isPublished: boolean;
  availableFrom?: string | Date | null;
  availableUntil?: string | Date | null;
}): TestWindowStatus {
  if (!test.isPublished) return "draft";
  const now = Date.now();
  const from = test.availableFrom ? new Date(test.availableFrom).getTime() : null;
  const until = test.availableUntil ? new Date(test.availableUntil).getTime() : null;
  if (from != null && now < from) return "upcoming";
  if (until != null && now > until) return "closed";
  return "open";
}

export function formatScheduleRange(
  from: string | Date | null | undefined,
  until: string | Date | null | undefined
): string {
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  if (from && until) return `${fmt(new Date(from))} – ${fmt(new Date(until))}`;
  if (from) return `Opens ${fmt(new Date(from))}`;
  if (until) return `Closes ${fmt(new Date(until))}`;
  return "Open now (no end time set)";
}

export function toDatetimeLocalValue(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
