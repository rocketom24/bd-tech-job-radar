import type { JobSummary } from "./api-types";

const CURRENCY_LABEL: Record<string, string> = { BDT: "Tk" };
const PERIOD_LABEL = { MONTHLY: "month", YEARLY: "year", HOURLY: "hour" } as const;

/** Decimal strings arrive from the API; only finite, non-negative numbers are displayable. */
function amount(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Salary text for a job: structured fields first, legacy `salary` text as the fallback. */
export function formatSalary(job: Pick<JobSummary, "salary" | "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod" | "salaryDisclosure">): string {
  const legacy = job.salary?.trim() || "Not listed";
  if (job.salaryDisclosure === "NEGOTIABLE") return "Negotiable";
  if (job.salaryDisclosure === "NOT_DISCLOSED") return "Not disclosed";
  if (job.salaryDisclosure !== "DISCLOSED") return legacy;

  const min = amount(job.salaryMin);
  const max = amount(job.salaryMax);
  if (min === null && max === null) return legacy;
  const code = job.salaryCurrency ?? "";
  const cur = CURRENCY_LABEL[code] ?? code;
  const money = (n: number) => `${cur ? `${cur} ` : ""}${fmt(n)}`;
  const range = min !== null && max !== null ? (min === max ? money(min) : `${money(min)} – ${fmt(max)}`) : min !== null ? `From ${money(min)}` : `Up to ${money(max as number)}`;
  const period = job.salaryPeriod ? ` / ${PERIOD_LABEL[job.salaryPeriod]}` : "";
  return `${range}${period}`;
}

const DAY = 86_400_000;

/**
 * Calendar pieces of a deadline. Deadlines are stored as UTC midnight, so `days` counts whole
 * UTC calendar days from today (0 = today, negative = passed), whatever the time of day.
 */
export function deadlineParts(deadline: string | null, now = Date.now()): { day: string; month: string; year: string; date: string; days: number } | null {
  const time = deadline ? Date.parse(deadline) : NaN;
  if (Number.isNaN(time)) return null;
  const d = new Date(time);
  return {
    day: String(d.getUTCDate()),
    month: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    year: String(d.getUTCFullYear()),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    days: Math.floor(time / DAY) - Math.floor(now / DAY),
  };
}

/** Deadline as { label, tone }: closing soon means today or within the next 7 days. */
export function formatDeadline(deadline: string | null, now = Date.now()): { label: string; tone: "none" | "ok" | "soon" | "past" } {
  const p = deadlineParts(deadline, now);
  if (!p) return { label: "No deadline", tone: "none" };
  if (p.days < 0) return { label: `Closed ${p.date}`, tone: "past" };
  if (p.days === 0) return { label: "Closes today", tone: "soon" };
  if (p.days <= 7) return { label: `${p.days} day${p.days === 1 ? "" : "s"} left · ${p.date}`, tone: "soon" };
  return { label: p.date, tone: "ok" };
}

/** Avatar initials from the email's local part: first letter of up to two word-like pieces. */
export function initials(email: string): string {
  const local = email.split("@")[0];
  const letters = local.split(/[^a-zA-Z]+/).filter(Boolean).slice(0, 2).map((s) => s[0]);
  return (letters.join("") || local[0] || "?").toUpperCase();
}

/** Salary text split into the amount and its period ("Tk 55,000 – 90,000", "month"). */
export function salaryParts(job: Parameters<typeof formatSalary>[0]): { amount: string; period: string | null } {
  const text = formatSalary(job);
  const at = text.lastIndexOf(" / ");
  return at === -1 ? { amount: text, period: null } : { amount: text.slice(0, at), period: text.slice(at + 3) };
}

/** Only same-site relative paths may be used as a post-login destination. */
export function safeNext(value: string | null): string {
  // Reject backslashes and control chars (browsers strip tabs/newlines, turning "/\t/x.com" into "//x.com").
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\u0000-\u001F\u007F\\]/.test(value)) return "/";
  try {
    // Parse against a dummy origin: anything that resolves elsewhere is not a same-site path.
    const u = new URL(value, "http://same-site.invalid");
    // Dot segments can normalise "/a/../..//evil.com" to "//evil.com", a protocol-relative URL.
    if (u.origin !== "http://same-site.invalid" || u.pathname.startsWith("//")) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
