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

// The production @spacecat Slack bot's user ID (confirmed from real
// `run audit` messages in #aem-sites-optimizer-automation), used to build a
// real Slack mention rather than literal "@spacecat" text, which Slack
// doesn't resolve/highlight on its own.
const SPACECAT_SLACK_BOT_MENTION = '<@U05AMKKSZPG>';

// The bot expects a bare domain (no scheme), matching how it's actually
// invoked in practice — e.g. "run audit lovesac.com offsite-brand-presence".
export const spacecatAuditCommand = (baseURL: string): string => {
  const domain = baseURL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${SPACECAT_SLACK_BOT_MENTION} run audit ${domain} offsite-brand-presence`;
};

const LLMO_PRODUCT_HINTS = ['llmo', 'LLMO', 'ai-visibility', 'AI_VISIBILITY', 'llm_optimizer', 'LLM_OPTIMIZER'];
// Internal/test/dev-preview sites that shouldn't show up as real customers,
// in either the paid or trial tables.
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
  'https://abcxyztest.com',
  'https://agldstqtrtest.digital.agl.com.au',
  'https://playwright-503-repro.com',
  'https://xyz.com',
  'https://departmentof.com',
]);

// Sites that are SSRF / DNS-rebinding security probes, not real onboarding
// attempts — someone (or an automated scanner) testing whether the
// site-onboarding flow can be tricked into fetching an attacker-controlled or
// internal-network URL. Kept separate from INTERNAL_TEST_CUSTOMERS because
// these represent a security concern worth escalating to whoever owns that
// flow, not routine internal/dev noise. Three distinct techniques seen so
// far:
//   - nip.io / sslip.io: wildcard DNS services that resolve a subdomain
//     encoding an IP address (e.g. "130-61-169-1.nip.io" -> 130.61.169.1) to
//     that literal IP — used to make a "hostname" resolve to an internal or
//     cloud-metadata address despite looking like an ordinary domain.
//   - A bare link-local address (169.254.169.254) — the AWS/Azure/GCP cloud
//     instance metadata endpoint, a classic SSRF target.
//   - oastify.com and the interactsh-style domain below: out-of-band
//     interaction services (Burp Suite Collaborator, Interactsh) that let a
//     scanner detect a "blind" SSRF by checking whether the target server
//     ever made an outbound request to a throwaway generated subdomain.
const SECURITY_PROBE_SITES = new Set([
  'http://169-254-169-254.nip.io/latest/meta-data',
  'https://169.254.169.254',
  'http://823da901.sslip.io',
  'http://cachebuster1.130.61.169.1.nip.io',
  'http://cachebuster2-130-61-169-1.nip.io',
  'http://cachebuster3-823da901.nip.io',
  'http://cachebuster4-823da901.sslip.io',
  'https://t3xvtcra96mvq6dyrq06oyqw2n8ew7kw.oastify.com/path/working/test',
  'http://0532vjthbdo2sdf5tx2dq5s34ualyhm6.oastify.com',
  'https://15e52187b74c53d6.d9fj7bnvm6m661e3',
]);

// Whole orgs known to be internal/test accounts — every site under one of
// these is excluded, present and future, rather than needing each new
// throwaway domain added to INTERNAL_TEST_CUSTOMERS by name as it appears.
// Deliberately empty for now: a6286f15-86c3-4f18-b4ee-f5f37c894248 (the
// ravitest.com org) also owns wsop.com, whose status as test-vs-real is
// still unconfirmed — add it here (not just its other 3 sites above) once
// that's settled.
const INTERNAL_TEST_ORGANIZATIONS = new Set<string>([]);

export const isLlmoSite = (site: SpacecatSite) => Boolean(site.config?.llmo);

export const normalizeOpportunityStatus = (status: string | undefined) => status?.trim().toUpperCase();

const normalizeCustomerIdentity = (value: string) => value.trim().toLowerCase().replace(/\/+$/, '');

// Accepts anything with a siteName/baseURL/organizationId — SiteOpportunityRow
// qualifies, but so does a plain object derived straight from a SpacecatSite,
// before a full row has been built.
export const isInternalTestCustomer = (identity: {
  siteName: string;
  baseURL: string;
  organizationId: string;
}) => {
  const siteName = normalizeCustomerIdentity(identity.siteName);
  const baseURL = normalizeCustomerIdentity(identity.baseURL);

  return (
    INTERNAL_TEST_CUSTOMERS.has(siteName) ||
    INTERNAL_TEST_CUSTOMERS.has(baseURL) ||
    SECURITY_PROBE_SITES.has(siteName) ||
    SECURITY_PROBE_SITES.has(baseURL) ||
    INTERNAL_TEST_ORGANIZATIONS.has(identity.organizationId)
  );
};

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
