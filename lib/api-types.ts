// Response shapes of the existing API. Source of truth: app/api/** and API.md.
// Prisma Decimal values (salaryMin/Max) are serialized as JSON strings.

export type SubscriptionStatus = "FREE" | "PRO";
export type SalaryPeriod = "MONTHLY" | "YEARLY" | "HOURLY";
export type SalaryDisclosure = "DISCLOSED" | "NEGOTIABLE" | "NOT_DISCLOSED";

export interface SafeUser {
  id: number;
  email: string;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}

export interface JobSummary {
  id: number;
  title: string;
  organization: string;
  sector: string;
  category: string;
  location: string;
  salary: string;
  salaryMin: string | null;
  salaryMax: string | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  salaryDisclosure: SalaryDisclosure | null;
  experience: string;
  skills: string[];
  deadline: string | null;
  sourceId: number;
  verified: boolean;
  createdAt: string;
}

export interface JobSource {
  id: number;
  name: string;
  type: "GOVERNMENT" | "COMPANY" | "UNIVERSITY" | "NGO" | "PORTAL" | "OTHER";
  url: string;
}

export interface JobDetail extends JobSummary {
  description: string;
  sourceUrl: string;
  source: JobSource;
}

export interface UsageCounter {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

export interface Usage {
  subscriptionStatus: SubscriptionStatus;
  jobViews: UsageCounter;
  applyClicks: UsageCounter;
}

export interface JobFilters {
  keyword?: string;
  location?: string;
  category?: string;
}

/** Envelope differences are real: most routes use { data }, usage adds success, apply is top-level. */
export interface DataEnvelope<T> {
  data: T;
}
export interface UsageResponse extends DataEnvelope<Usage> {
  success: true;
}
export interface ApplyResponse {
  success: true;
  applyUrl: string;
  remaining: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
