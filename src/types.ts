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

// GET /organizations/{id}. A non-null semrushWorkspaceId means the org has a
// Semrush workspace linked (the established "has Semrush integration" signal).
export interface SpacecatOrganization {
  id: string;
  name?: string;
  imsOrgId?: string;
  semrushWorkspaceId?: string | null;
  [key: string]: unknown;
}

export interface SpacecatSuggestion {
  id: string;
  opportunityId: string;
  status: string;
  [key: string]: unknown;
}


// Per-opportunity LLM spend, stamped by mystique into the opportunity JSON
// (opportunity.llmUsage) for the run that produced it. Present only for
// reddit/youtube/cited — wikipedia opportunities are never tracked. Cost is
// litellm-priced and best-effort (0 for models missing from litellm's price
// table, even with non-zero tokens; reddit slightly undercounts), so it's an
// estimate, not a billing figure.
export interface LlmUsage {
  totalLlmCalls: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface SiteOpportunityRow {
  siteId: string;
  siteName: string;
  baseURL: string;
  organizationId: string;
  // Effective region: the API's site.region when set, otherwise inferred from
  // the domain's country-code TLD (see resolveSiteRegion). null when neither
  // is available (e.g. a .com site with no API region).
  region?: string | null;
  // True when `region` came from the domain TLD rather than the API, so the UI
  // can mark it as a best-guess.
  regionInferred?: boolean;
  // Whether the site's organization has a Semrush workspace linked
  // (org.semrushWorkspaceId non-null). Absent when not resolved for this row.
  hasSemrush?: boolean;
  customerGroup: CustomerGroup;
  entitlementTier: string;
  indicators: Record<SourceKey, OpportunityIndicator>;
  opportunityIds: Record<SourceKey, string>;
  opportunityDates: Record<SourceKey, string>;
  // LLM usage per source, read off the opportunity object itself (no extra
  // call). Absent (not zero) for a source means that opportunity carried no
  // llmUsage block — always the case for wikipedia, and for any source with
  // no opportunity.
  llmUsage?: Partial<Record<SourceKey, LlmUsage>>;
  // All opportunities grouped by source key, used for expanded-row sub-tables
  // and client-side week filtering. Populated by buildSiteRow.
  allOpportunitiesBySource: Record<SourceKey, SpacecatOpportunity[]>;
  // Suggestion counts keyed by opportunity ID; lazily populated when a row is
  // expanded. Absent means "not yet fetched", not "zero".
  suggestionCountsByOpportunityId?: Record<string, number>;
  loadError?: string;
}

export interface DashboardDataset {
  rows: SiteOpportunityRow[];
  generatedAt: string;
}

export interface FilterState {
  weeks: string[];              // ISO-ish labels e.g. ['W33 2026']; empty = all
  sourceKeys: SourceKey[];      // enabled sources; subset of OPPORTUNITY_SOURCES keys
  tiers: CustomerGroup[];       // enabled tiers; e.g. ['paid', 'trial']
  // null = all sites; [] = none selected; string[] = exact baseURL allowlist
  selectedSites: string[] | null;
}

// Compute current week label inline to avoid a circular dependency
// (weekFilter.ts imports SpacecatOpportunity from types.ts).
const _computeCurrentWeek = (): string[] => {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const target = new Date(date);
  target.setUTCDate(date.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return [`W${String(week).padStart(2, '0')} ${target.getUTCFullYear()}`];
};

export const DEFAULT_FILTER_STATE: FilterState = {
  weeks: _computeCurrentWeek(),
  sourceKeys: Object.keys(OPPORTUNITY_SOURCES) as SourceKey[],
  tiers: ['paid'],
  selectedSites: null,
};
