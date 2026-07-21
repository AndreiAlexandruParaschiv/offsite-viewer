export const API_DEFAULT_BASE_URL = 'https://llmo.experiencecloud.live/api/v1';

export const OPPORTUNITY_SOURCES = {
  reddit: {
    key: 'reddit',
    label: 'Reddit',
    opportunityType: 'reddit-analysis',
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    opportunityType: 'youtube-analysis',
  },
  cited: {
    key: 'cited',
    label: 'Cited',
    opportunityType: 'cited-analysis',
  },
  wikipedia: {
    key: 'wikipedia',
    label: 'Wikipedia',
    opportunityType: 'wikipedia-analysis',
  },
} as const;

export type SourceKey = keyof typeof OPPORTUNITY_SOURCES;

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

export interface SpacecatDrsJobResult {
  domain: string;
  datasetId: string;
  status: 'success' | 'error';
  error?: string;
  [key: string]: unknown;
}

// The `offsite-brand-presence` audit's auditResult shape — the upstream audit
// that scrapes brand-mention source URLs, from which reddit-analysis /
// youtube-analysis / cited-analysis opportunities are created. Wikipedia is
// handled entirely separately (by Mystique), so this tells us nothing about it.
export interface SpacecatOffsiteBrandPresenceAuditResult {
  success: boolean;
  error?: string;
  urlCounts?: Record<string, number>;
  drsJobs?: SpacecatDrsJobResult[];
  weeks?: string[];
  [key: string]: unknown;
}

export interface SpacecatAudit {
  siteId: string;
  auditedAt?: string;
  auditResult?: SpacecatOffsiteBrandPresenceAuditResult;
  [key: string]: unknown;
}

// Why a source shows "missing" (no visible/ignored opportunity), derived from
// the offsite-brand-presence audit: 'no-source-urls' means the audit ran fine
// but found nothing to scrape for that source (an upstream data/config gap,
// not an audit failure); 'audit-error' means the audit itself failed.
export type MissingReason = 'no-source-urls' | 'audit-error';

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
  // Why a "missing" source is missing (reddit/youtube/cited only — see
  // MissingReason). Absent means either not "missing", not fetched for this
  // row, or the audit data doesn't explain it either way.
  missingReasons?: Partial<Record<SourceKey, MissingReason>>;
  loadError?: string;
}

export interface DashboardDataset {
  rows: SiteOpportunityRow[];
  generatedAt: string;
}
