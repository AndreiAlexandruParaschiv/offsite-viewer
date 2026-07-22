export const API_DEFAULT_BASE_URL = 'https://llmo.experiencecloud.live/api/v1';

// cadence is the audit's actual run schedule — reddit/youtube/cited run
// weekly, wikipedia runs monthly. Mixing cadences together in an "audit
// coverage" count skews it, since a monthly source will always look
// under-run next to weekly ones over the same window.
export const OPPORTUNITY_SOURCES = {
  reddit: {
    key: 'reddit',
    label: 'Reddit',
    opportunityType: 'reddit-analysis',
    cadence: 'weekly',
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    opportunityType: 'youtube-analysis',
    cadence: 'weekly',
  },
  cited: {
    key: 'cited',
    label: 'Cited',
    opportunityType: 'cited-analysis',
    cadence: 'weekly',
  },
  wikipedia: {
    key: 'wikipedia',
    label: 'Wikipedia',
    opportunityType: 'wikipedia-analysis',
    cadence: 'monthly',
  },
} as const;

export type SourceKey = keyof typeof OPPORTUNITY_SOURCES;
export type SourceCadence = (typeof OPPORTUNITY_SOURCES)[SourceKey]['cadence'];

export type OpportunityIndicator = 'visible' | 'ignored' | 'missing';

export type CustomerGroup = 'paid' | 'trial' | 'free';

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SpacecatSite {
  id: string;
  baseURL: string;
  name?: string | null;
  organizationId: string;
  deliveryType?: string;
  isLive?: boolean;
  isSandbox?: boolean;
  region?: string | null;
  config?: {
    llmo?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface SpacecatOpportunity {
  id: string;
  siteId: string;
  type: string;
  status: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface SpacecatEntitlement {
  id: string;
  organizationId: string;
  productCode: string;
  tier: string;
  [key: string]: unknown;
}

export interface SpacecatSuggestion {
  id: string;
  opportunityId: string;
  status: string;
  [key: string]: unknown;
}

// GET /sites/{siteId}/latest-audit/{auditType} — the audit that produces (or
// fails to produce) a source's opportunity. auditResult.success distinguishes
// a real audit failure from "ran fine, nothing to report".
export interface SpacecatAuditResult {
  success: boolean;
  error?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SpacecatAudit {
  auditType: string;
  auditedAt?: string;
  auditResult?: SpacecatAuditResult;
  [key: string]: unknown;
}

export interface MissingOpportunityInfo {
  kind: 'audit-error' | 'no-opportunity';
  detail?: string;
  auditedAt?: string;
}

export interface SiteOpportunityRow {
  siteId: string;
  siteName: string;
  baseURL: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  entitlementTier: string;
  indicators: Record<SourceKey, OpportunityIndicator>;
  opportunityIds: Record<SourceKey, string>;
  opportunityDates: Record<SourceKey, string>;
  // Suggestion counts per source, fetched separately (one extra call per
  // opportunity) and only populated for rows this was requested for — absent
  // (not zero) means "not fetched", not "zero suggestions".
  suggestionCounts?: Partial<Record<SourceKey, number>>;
  // Why a "missing" source is missing, fetched per-source (one extra call per
  // missing source) and only populated for rows this was requested for.
  missingInfo?: Partial<Record<SourceKey, MissingOpportunityInfo>>;
  loadError?: string;
}

export interface DashboardDataset {
  rows: SiteOpportunityRow[];
  generatedAt: string;
}
