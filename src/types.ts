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

export interface SiteOpportunityRow {
  siteId: string;
  siteName: string;
  baseURL: string;
  organizationId: string;
  customerGroup: CustomerGroup;
  entitlementTier: string;
  indicators: Record<SourceKey, OpportunityIndicator>;
  opportunityIds: Record<SourceKey, string>;
  loadError?: string;
}

export interface DashboardDataset {
  rows: SiteOpportunityRow[];
  generatedAt: string;
}
