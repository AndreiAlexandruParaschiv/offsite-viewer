import {
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type DashboardDataset,
  type OpportunityIndicator,
  type SiteOpportunityRow,
  type SourceKey,
  type SpacecatEntitlement,
  type SpacecatOpportunity,
  type SpacecatSite,
} from '../types';

const sourceEntries = Object.entries(OPPORTUNITY_SOURCES) as Array<
  [SourceKey, (typeof OPPORTUNITY_SOURCES)[SourceKey]]
>;

const LLMO_PRODUCT_HINTS = ['llmo', 'LLMO', 'ai-visibility', 'AI_VISIBILITY', 'llm_optimizer', 'LLM_OPTIMIZER'];
// Internal/test/dev-preview sites and onboarding-flow probes that shouldn't
// show up as real customers, in either the paid or trial tables.
const INTERNAL_TEST_CUSTOMERS = new Set([
  'llmo release notes',
  'https://test-tokowaka.testaemcloud.com',
  'https://optimize-at-edge.testaemcloud.com',
  'https://tokowaka.now',
  'buzios-vibe.com',
  'https://buzios-vibe.com',
  'http://buzios-vibe.com',
  'https://main--cloudfront-setup--ssilare-adobe.aem.page',
  'https://main--frescopa-dba--ktzmishra.aem.live',
  'https://frescopa.aem-screens.net',
  'https://ravitest.com',
  'https://testingmypoc.com',
  'https://author-p180456-e1899464.adobeaemcloud.com',
  'https://frescopa-unibuc.testaemcloud.com',
  'https://llmo-onboardtest10.com',
  'https://main--fastowl28790--aemsitestrial.aem.page',
  'https://main--wknd-universal--tuckerelliott.aem.page',
  'https://test.net',
  'https://tester.com',
  'https://testing.com',
  'https://testurl.com',
  'https://testuser.com',
  'http://169-254-169-254.nip.io/latest/meta-data',
  'https://abcxyztest.com',
  'https://agldstqtrtest.digital.agl.com.au',
  'https://t3xvtcra96mvq6dyrq06oyqw2n8ew7kw.oastify.com/path/working/test',
]);

export const isLlmoSite = (site: SpacecatSite) => Boolean(site.config?.llmo);

export const normalizeOpportunityStatus = (status: string | undefined) => status?.trim().toUpperCase();

const normalizeCustomerIdentity = (value: string) => value.trim().toLowerCase().replace(/\/+$/, '');

// Accepts anything with a siteName/baseURL — SiteOpportunityRow qualifies,
// but so does a plain { siteName, baseURL } derived straight from a
// SpacecatSite, before a full row has been built.
export const isInternalTestCustomer = (identity: { siteName: string; baseURL: string }) =>
  INTERNAL_TEST_CUSTOMERS.has(normalizeCustomerIdentity(identity.siteName)) ||
  INTERNAL_TEST_CUSTOMERS.has(normalizeCustomerIdentity(identity.baseURL));

export const resolveOpportunityDate = (opportunities: SpacecatOpportunity[]): string => {
  if (opportunities.length === 0) {
    return '';
  }

  if (opportunities.length === 1) {
    const [only] = opportunities;
    return only.createdAt ?? only.updatedAt ?? '';
  }

  return opportunities.reduce((latest, opportunity) => {
    const timestamp = opportunity.updatedAt ?? opportunity.createdAt ?? '';
    return timestamp > latest ? timestamp : latest;
  }, '');
};

export const indicatorFromOpportunities = (
  opportunities: SpacecatOpportunity[],
  opportunityType: string,
): { indicator: OpportunityIndicator; opportunityId: string; date: string } => {
  const matching = opportunities.filter((opportunity) => opportunity.type === opportunityType);
  const visible = matching.find((opportunity) => normalizeOpportunityStatus(opportunity.status) === 'NEW');

  if (visible) {
    return { indicator: 'visible', opportunityId: visible.id, date: resolveOpportunityDate(matching) };
  }

  const ignored = matching.find(
    (opportunity) => normalizeOpportunityStatus(opportunity.status) === 'IGNORED',
  );

  if (ignored) {
    return { indicator: 'ignored', opportunityId: ignored.id, date: resolveOpportunityDate(matching) };
  }

  return { indicator: 'missing', opportunityId: '', date: '' };
};

export const findLlmoEntitlement = (entitlements: SpacecatEntitlement[]) => {
  const exact = entitlements.find((entitlement) =>
    LLMO_PRODUCT_HINTS.includes(String(entitlement.productCode)),
  );

  if (exact) {
    return exact;
  }

  return entitlements.find((entitlement) =>
    LLMO_PRODUCT_HINTS.some((hint) =>
      String(entitlement.productCode).toLowerCase().includes(hint.toLowerCase()),
    ),
  );
};

export const customerGroupFromTier = (tier: string | undefined): CustomerGroup => {
  const normalizedTier = tier?.trim().toUpperCase();

  if (normalizedTier === 'PAID') {
    return 'paid';
  }

  if (normalizedTier === 'FREE_TRIAL' || normalizedTier === 'TRIAL') {
    return 'trial';
  }

  return 'free';
};

export const buildSiteRow = ({
  site,
  opportunities,
  entitlements,
  loadError,
}: {
  site: SpacecatSite;
  opportunities: SpacecatOpportunity[];
  entitlements: SpacecatEntitlement[];
  loadError?: string;
}): SiteOpportunityRow => {
  const llmoEntitlement = findLlmoEntitlement(entitlements);
  const entitlementTier = llmoEntitlement?.tier ?? 'none';
  const indicators = {} as Record<SourceKey, OpportunityIndicator>;
  const opportunityIds = {} as Record<SourceKey, string>;
  const opportunityDates = {} as Record<SourceKey, string>;

  sourceEntries.forEach(([sourceKey, source]) => {
    const result = indicatorFromOpportunities(opportunities, source.opportunityType);
    indicators[sourceKey] = result.indicator;
    opportunityIds[sourceKey] = result.opportunityId;
    opportunityDates[sourceKey] = result.date;
  });

  return {
    siteId: site.id,
    siteName: site.name || site.baseURL,
    baseURL: site.baseURL,
    organizationId: site.organizationId,
    customerGroup: customerGroupFromTier(entitlementTier),
    entitlementTier,
    indicators,
    opportunityIds,
    opportunityDates,
    loadError,
  };
};

export const getOverviewCounts = (rows: SiteOpportunityRow[]) =>
  sourceEntries.reduce(
    (counts, [sourceKey]) => ({
      ...counts,
      [sourceKey]: rows.filter((row) => row.indicators[sourceKey] === 'visible').length,
    }),
    {} as Record<SourceKey, number>,
  );

export const groupRows = (rows: SiteOpportunityRow[]) => ({
  paid: rows.filter((row) => row.customerGroup === 'paid' && !isInternalTestCustomer(row)),
  trial: rows.filter((row) => row.customerGroup === 'trial' && !isInternalTestCustomer(row)),
  free: rows.filter((row) => row.customerGroup === 'free'),
});

const csvEscape = (value: string | number) => {
  const raw = String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }

  return raw;
};

// ISO 8601 week: weeks start Monday, week 1 contains the year's first Thursday.
export const formatIsoWeek = (dateIso: string): string => {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export const toCsv = (dataset: DashboardDataset) => {
  const headers = [
    'Site name',
    'Base URL',
    'Site ID',
    'Organization ID',
    'Customer group',
    'Entitlement tier',
    'Reddit',
    'Reddit date',
    'YouTube',
    'YouTube date',
    'Cited',
    'Cited date',
    'Wikipedia',
    'Wikipedia date',
    'Reddit opportunity ID',
    'YouTube opportunity ID',
    'Cited opportunity ID',
    'Wikipedia opportunity ID',
    'Load error',
    'Generated at',
    'Week of year',
  ];

  const weekOfYear = formatIsoWeek(dataset.generatedAt);

  const rows = dataset.rows.map((row) => [
    row.siteName,
    row.baseURL,
    row.siteId,
    row.organizationId,
    row.customerGroup,
    row.entitlementTier,
    row.indicators.reddit,
    row.opportunityDates.reddit,
    row.indicators.youtube,
    row.opportunityDates.youtube,
    row.indicators.cited,
    row.opportunityDates.cited,
    row.indicators.wikipedia,
    row.opportunityDates.wikipedia,
    row.opportunityIds.reddit,
    row.opportunityIds.youtube,
    row.opportunityIds.cited,
    row.opportunityIds.wikipedia,
    row.loadError ?? '',
    dataset.generatedAt,
    weekOfYear,
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
};
