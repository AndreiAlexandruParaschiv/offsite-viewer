import { PAID_SITE_ID_ALLOWLIST } from '../data/paidSiteAllowlist';
import { formatWeekLabel, isoWeeksAgo, opportunityTouchedInWeeks } from './weekFilter';
import {
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type DashboardDataset,
  type LlmUsage,
  type OpportunityIndicator,
  type SiteOpportunityRow,
  type SourceKey,
  type SpacecatEntitlement,
  type SpacecatOpportunity,
  type SpacecatSite,
  type SpacecatSuggestion,
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
export const spacecatAuditCommand = (baseURL: string, auditType = 'offsite-brand-presence'): string => {
  const domain = baseURL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${SPACECAT_SLACK_BOT_MENTION} run audit ${domain} ${auditType}`;
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
  'https://abhishek.com',
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
  'https://15e52187b74c53d6.d9fj7bnvm6m661e3pl90cbdru1s',
]);

// Whole orgs known to be internal/test accounts — every site under one of
// these is excluded, present and future, rather than needing each new
// throwaway domain added to INTERNAL_TEST_CUSTOMERS by name as it appears.
// Deliberately empty for now: a6286f15-86c3-4f18-b4ee-f5f37c894248 (the
// ravitest.com org) also owns wsop.com, whose status as test-vs-real is
// still unconfirmed — add it here (not just its other 3 sites above) once
// that's settled.
const INTERNAL_TEST_ORGANIZATIONS = new Set<string>([]);

// Regions the offsite audits actually run for. Hardcoded copy of the
// audit-worker's accepted set (US/GB/CA/AU/IE/NZ) — a site whose region is
// outside this set won't get offsite audits, so surfacing it flags the
// jp/es/de-style sites that silently never run. Kept as a plain set here; if
// the backend list ever moves or grows, update it to match.
export const ACCEPTED_REGIONS = new Set(['US', 'GB', 'CA', 'AU', 'IE', 'NZ']);

export const normalizeRegion = (region: string | null | undefined): string =>
  (region ?? '').trim().toUpperCase();

// Country-code TLD → region, used to infer a region when the API doesn't set
// site.region. Deliberately a curated country list, NOT "any 2-letter TLD":
// TLDs commonly used generically (.io, .ai, .co, .me, .tv) are intentionally
// omitted so a brand.io/brand.co site isn't mislabeled as a country. .uk maps
// to GB (its ISO region), and multi-part TLDs resolve on the final label
// (.co.uk → uk → GB, .com.au → au → AU).
const CCTLD_TO_REGION: Record<string, string> = {
  us: 'US', uk: 'GB', gb: 'GB', ca: 'CA', au: 'AU', ie: 'IE', nz: 'NZ',
  it: 'IT', es: 'ES', de: 'DE', fr: 'FR', nl: 'NL', be: 'BE', ch: 'CH',
  at: 'AT', se: 'SE', no: 'NO', dk: 'DK', fi: 'FI', pt: 'PT', pl: 'PL',
  cz: 'CZ', gr: 'GR', ro: 'RO', hu: 'HU', ru: 'RU', ua: 'UA', tr: 'TR',
  jp: 'JP', cn: 'CN', kr: 'KR', in: 'IN', hk: 'HK', tw: 'TW', sg: 'SG',
  th: 'TH', my: 'MY', ph: 'PH', vn: 'VN', br: 'BR', mx: 'MX', ar: 'AR',
  cl: 'CL', pe: 'PE', sa: 'SA', ae: 'AE', il: 'IL', za: 'ZA', eg: 'EG',
};

// Infers a region from a base URL's country-code TLD, or undefined for a
// generic/unknown TLD (.com/.net/.org/.io/…).
export const regionFromBaseUrl = (baseURL: string | null | undefined): string | undefined => {
  if (!baseURL) {
    return undefined;
  }

  const host = baseURL
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
  const tld = host.split('.').filter(Boolean).pop();

  return tld ? CCTLD_TO_REGION[tld] : undefined;
};

// The region to show/flag for a site: the API's value wins; a ccTLD-inferred
// value is the fallback (marked inferred so the UI can show it's a best-guess).
export const resolveSiteRegion = (input: {
  region?: string | null;
  baseURL?: string | null;
}): { region?: string; inferred: boolean } => {
  const apiRegion = normalizeRegion(input.region);
  if (apiRegion) {
    return { region: apiRegion, inferred: false };
  }

  const inferred = regionFromBaseUrl(input.baseURL);
  return inferred ? { region: inferred, inferred: true } : { region: undefined, inferred: false };
};

// undefined when the region is unknown (API returned nothing) — distinct from
// a known region that simply isn't accepted, so the UI can show "—" rather
// than falsely flagging an unknown as unsupported.
export const isAcceptedRegion = (region: string | null | undefined): boolean | undefined => {
  const normalized = normalizeRegion(region);
  if (!normalized) {
    return undefined;
  }

  return ACCEPTED_REGIONS.has(normalized);
};

export const isLlmoSite = (site: SpacecatSite) => Boolean(site.config?.llmo);

/**
 * Maps a raw hallucination rate (0–1) to a severity level.
 * Thresholds mirror the quality-gate display in SourceSummaryCard / TotalsBar.
 */
export const hallucinationLevel = (rate: number): 'ok' | 'warn' | 'high' =>
  rate < 0.1 ? 'ok' : rate <= 0.25 ? 'warn' : 'high';

export const normalizeOpportunityStatus = (status: string | undefined) => status?.trim().toUpperCase();

// An opportunity accumulates suggestions across audit runs and marks the
// superseded ones OUTDATED, so the raw suggestion list sums stale + current.
// Count only the current (non-OUTDATED) ones, so the number reflects the
// latest run rather than the running total.
export const countCurrentSuggestions = (suggestions: SpacecatSuggestion[]): number =>
  suggestions.filter((suggestion) => normalizeOpportunityStatus(suggestion.status) !== 'OUTDATED').length;

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

// Always the latest time the opportunity was touched — prefer updatedAt over
// createdAt, and across multiple opportunities of a type take the most recent.
// An opportunity can be created once (e.g. Mar 4) and then re-updated by every
// later audit run (e.g. Jul 22); the run date is what's meaningful here, so a
// stale createdAt must never win over a newer updatedAt.
export const resolveOpportunityDate = (opportunities: SpacecatOpportunity[]): string =>
  opportunities.reduce((latest, opportunity) => {
    const timestamp = opportunity.updatedAt ?? opportunity.createdAt ?? '';
    return timestamp > latest ? timestamp : latest;
  }, '');

// Pulls the LLM-usage block off an opportunity. The live LLMO API nests it at
// data.fullAnalysis.opportunity.llmUsage — mystique stamps it onto the BO
// JSON's opportunity, which Spacecat stores under data.fullAnalysis (verified
// against real reddit/youtube/cited opportunities, 2026-07-28; wikipedia has
// none). The top-level / data.llmUsage reads are kept as harmless fallbacks in
// case the shape ever flattens. Returns undefined unless all three fields are
// present and finite, so a partial/garbage payload never renders as bogus
// zeros.
export const extractLlmUsage = (opportunity: SpacecatOpportunity): LlmUsage | undefined => {
  const data = opportunity.data as Record<string, unknown> | undefined;
  const fullAnalysisOpportunity = (data?.fullAnalysis as { opportunity?: unknown } | undefined)
    ?.opportunity as Record<string, unknown> | undefined;
  const candidate = (opportunity.llmUsage ??
    data?.llmUsage ??
    fullAnalysisOpportunity?.llmUsage) as Partial<LlmUsage> | undefined;
  if (!candidate) {
    return undefined;
  }

  const { totalLlmCalls, totalTokens, totalCostUsd } = candidate;
  if (
    !Number.isFinite(totalLlmCalls) ||
    !Number.isFinite(totalTokens) ||
    !Number.isFinite(totalCostUsd)
  ) {
    return undefined;
  }

  return {
    totalLlmCalls: totalLlmCalls as number,
    totalTokens: totalTokens as number,
    totalCostUsd: totalCostUsd as number,
  };
};

export interface QaVerdict {
  rate: number;
  analyzedCount: number;
  hallucinatedCount: number;
  rateDetermined: boolean;
}

// Reads the qaVerdict stamped by the mystique QA gate (Reddit, YouTube, Cited).
// Mirrors extractLlmUsage: the gate writes to bo_json["opportunity"]["qaVerdict"],
// which Spacecat stores under data.fullAnalysis.opportunity. Top-level fallbacks
// are kept for resilience if the shape ever changes.
// Returns undefined for Wikipedia (no gate) and any opportunity without the field.
// When rateDetermined is false the rate is meaningless — callers must treat it as N/A.
export const extractQaVerdict = (opportunity: SpacecatOpportunity): QaVerdict | undefined => {
  const data = opportunity.data as Record<string, unknown> | undefined;
  const fullAnalysisOpportunity = (data?.fullAnalysis as { opportunity?: unknown } | undefined)
    ?.opportunity as Record<string, unknown> | undefined;
  const raw = (fullAnalysisOpportunity?.qaVerdict ?? data?.qaVerdict) as Partial<QaVerdict> | undefined;
  if (!raw) return undefined;
  const { rate, analyzedCount, hallucinatedCount, rateDetermined } = raw;
  if (!Number.isFinite(rate) || !Number.isFinite(analyzedCount) || !Number.isFinite(hallucinatedCount)) return undefined;
  return {
    rate: rate as number,
    analyzedCount: analyzedCount as number,
    hallucinatedCount: hallucinatedCount as number,
    rateDetermined: rateDetermined !== false,
  };
};

export const indicatorFromOpportunities = (
  opportunities: SpacecatOpportunity[],
  opportunityType: string,
): {
  indicator: OpportunityIndicator;
  opportunityId: string;
  date: string;
  llmUsage?: LlmUsage;
} => {
  const matching = opportunities.filter((opportunity) => opportunity.type === opportunityType);

  if (matching.length === 0) {
    return { indicator: 'missing', opportunityId: '', date: '' };
  }

  // Multiple opportunities of the same type can coexist across separate
  // audit runs (e.g. a Jul 20 run left NEW, a Jul 22 run marked IGNORED) — the
  // most recently updated/created one determines the displayed status, so an
  // older NEW can no longer outrank a newer IGNORED (or vice versa) just
  // because it happened to be found first.
  const latest = matching.reduce((current, opportunity) => {
    const currentTimestamp = current.updatedAt ?? current.createdAt ?? '';
    const candidateTimestamp = opportunity.updatedAt ?? opportunity.createdAt ?? '';

    if (candidateTimestamp > currentTimestamp) {
      return opportunity;
    }

    // On an exact timestamp tie, prefer IGNORED over any other status —
    // something can't logically be ignored before (or at the same instant)
    // it's created as NEW, so a tied IGNORED is the more authoritative/final
    // state rather than an arbitrary array-order pick.
    if (
      candidateTimestamp === currentTimestamp &&
      normalizeOpportunityStatus(opportunity.status) === 'IGNORED' &&
      normalizeOpportunityStatus(current.status) !== 'IGNORED'
    ) {
      return opportunity;
    }

    return current;
  });

  const status = normalizeOpportunityStatus(latest.status);
  const date = resolveOpportunityDate(matching);
  // Usage comes from the same opportunity we surface the id/date for, so the
  // cost shown lines up with the run whose status is displayed.
  const llmUsage = extractLlmUsage(latest);

  if (status === 'NEW') {
    return { indicator: 'visible', opportunityId: latest.id, date, llmUsage };
  }

  if (status === 'IGNORED') {
    return { indicator: 'ignored', opportunityId: latest.id, date, llmUsage };
  }

  return { indicator: 'missing', opportunityId: '', date: '' };
};

// Like indicatorFromOpportunities but applies a week filter first.
// When weeks is empty, behaves identically to indicatorFromOpportunities.
export const computeFilteredIndicator = (
  opportunities: SpacecatOpportunity[],
  opportunityType: string,
  weeks: string[],
): ReturnType<typeof indicatorFromOpportunities> => {
  const filtered =
    weeks.length === 0
      ? opportunities
      : opportunities.filter((o) => opportunityTouchedInWeeks(o, weeks));
  return indicatorFromOpportunities(filtered, opportunityType);
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

// Paid customers are restricted to the curated PAID_SITE_ID_ALLOWLIST — a
// site with a live PAID entitlement that isn't on that list is bucketed
// under Trial instead of Paid (not hidden). Only affects the 'paid' case;
// trial/free classification from the entitlement tier is unchanged.
export const resolveCustomerGroup = (tier: string | undefined, siteId: string): CustomerGroup => {
  const rawGroup = customerGroupFromTier(tier);

  if (rawGroup === 'paid' && !PAID_SITE_ID_ALLOWLIST.has(siteId)) {
    return 'trial';
  }

  return rawGroup;
};

export const buildSiteRow = ({
  site,
  opportunities,
  entitlements,
  hasSemrush,
  loadError,
}: {
  site: SpacecatSite;
  opportunities: SpacecatOpportunity[];
  entitlements: SpacecatEntitlement[];
  hasSemrush?: boolean;
  loadError?: string;
}): SiteOpportunityRow => {
  const llmoEntitlement = findLlmoEntitlement(entitlements);
  const entitlementTier = llmoEntitlement?.tier ?? 'none';
  const resolvedRegion = resolveSiteRegion({ region: site.region, baseURL: site.baseURL });
  const indicators = {} as Record<SourceKey, OpportunityIndicator>;
  const opportunityIds = {} as Record<SourceKey, string>;
  const opportunityDates = {} as Record<SourceKey, string>;
  const llmUsage: Partial<Record<SourceKey, LlmUsage>> = {};

  const allOpportunitiesBySource = {} as Record<SourceKey, SpacecatOpportunity[]>;
  sourceEntries.forEach(([sourceKey, source]) => {
    const result = indicatorFromOpportunities(opportunities, source.opportunityType);
    indicators[sourceKey] = result.indicator;
    opportunityIds[sourceKey] = result.opportunityId;
    opportunityDates[sourceKey] = result.date;
    if (result.llmUsage) {
      llmUsage[sourceKey] = result.llmUsage;
    }
    allOpportunitiesBySource[sourceKey] = opportunities.filter(
      (o) => o.type === source.opportunityType,
    );
  });

  return {
    siteId: site.id,
    siteName: site.name || site.baseURL,
    baseURL: site.baseURL,
    organizationId: site.organizationId,
    region: resolvedRegion.region ?? null,
    regionInferred: resolvedRegion.inferred,
    hasSemrush,
    customerGroup: resolveCustomerGroup(entitlementTier, site.id),
    entitlementTier,
    indicators,
    opportunityIds,
    opportunityDates,
    llmUsage,
    allOpportunitiesBySource,
    loadError,
  };
};

// Sums the LLM usage across every source present on one row — the per-site
// total. Sources with no usage (wikipedia, or any un-stamped opportunity)
// contribute nothing.
export const sumRowLlmUsage = (row: SiteOpportunityRow): LlmUsage =>
  sourceEntries.reduce(
    (total, [sourceKey]) => {
      const usage = row.llmUsage?.[sourceKey];
      if (usage) {
        total.totalLlmCalls += usage.totalLlmCalls;
        total.totalTokens += usage.totalTokens;
        total.totalCostUsd += usage.totalCostUsd;
      }
      return total;
    },
    { totalLlmCalls: 0, totalTokens: 0, totalCostUsd: 0 },
  );

// Sum LLM costs across every week-filtered opportunity for one source.
// This is the filter-aware replacement for row.llmUsage[sourceKey]: every opp
// that appears in the expanded sub-table contributes, not just the "winner".
export const computeFilteredSourceCost = (
  opportunities: SpacecatOpportunity[],
  weeks: string[],
): number => {
  const filtered =
    weeks.length === 0
      ? opportunities
      : opportunities.filter((o) => opportunityTouchedInWeeks(o, weeks));
  return filtered.reduce((sum, opp) => sum + (extractLlmUsage(opp)?.totalCostUsd ?? 0), 0);
};

// Sum costs across the enabled sources for one row, respecting the week filter.
export const computeFilteredRowCost = (
  row: SiteOpportunityRow,
  weeks: string[],
  enabledSourceKeys: SourceKey[],
): number =>
  enabledSourceKeys.reduce(
    (sum, key) =>
      sum + computeFilteredSourceCost(row.allOpportunitiesBySource[key] ?? [], weeks),
    0,
  );

// Grand total across a set of rows — used for the overview tile and the CSV
// totals row.
export const getLlmUsageTotal = (rows: SiteOpportunityRow[]): LlmUsage =>
  rows.reduce(
    (total, row) => {
      const rowTotal = sumRowLlmUsage(row);
      total.totalLlmCalls += rowTotal.totalLlmCalls;
      total.totalTokens += rowTotal.totalTokens;
      total.totalCostUsd += rowTotal.totalCostUsd;
      return total;
    },
    { totalLlmCalls: 0, totalTokens: 0, totalCostUsd: 0 },
  );

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

// USD for display: 2 dp is enough on screen; the raw value is kept for
// tooltips and CSV. Sub-cent runs read as "$0.00", which is honest for a
// litellm estimate.
export const formatUsd = (value: number): string =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Token/call counts with thousands separators.
export const formatCount = (value: number): string => value.toLocaleString();

// Sources that can carry LLM usage — wikipedia is never tracked, so it's
// omitted from the per-source CSV columns rather than emitting permanently
// blank ones.
const LLM_USAGE_CSV_SOURCES: Array<[SourceKey, string]> = [
  ['reddit', 'Reddit'],
  ['youtube', 'YouTube'],
  ['cited', 'Cited'],
];

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
    'Region',
    'Region source',
    'Region accepted (audit)',
    'Semrush',
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
    ...LLM_USAGE_CSV_SOURCES.flatMap(([, label]) => [
      `${label} LLM calls`,
      `${label} LLM tokens`,
      `${label} LLM cost (USD)`,
    ]),
    'LLM calls (total)',
    'LLM tokens (total)',
    'LLM cost USD (total)',
  ];

  const weekOfYear = formatIsoWeek(dataset.generatedAt);

  // A blank cell (not 0) means the source carried no usage block; a real 0
  // (e.g. litellm had no price for the model) is kept distinct.
  const usageCell = (value: number | undefined) => (value === undefined ? '' : value);

  const rows = dataset.rows.map((row) => {
    const rowTotal = sumRowLlmUsage(row);

    return [
      row.siteName,
      row.baseURL,
      row.siteId,
      row.organizationId,
      row.customerGroup,
      row.entitlementTier,
      row.region ?? '',
      row.region ? (row.regionInferred ? 'domain' : 'api') : '',
      (() => {
        const accepted = isAcceptedRegion(row.region);
        return accepted === undefined ? '' : accepted ? 'yes' : 'no';
      })(),
      row.hasSemrush === undefined ? '' : row.hasSemrush ? 'yes' : 'no',
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
      ...LLM_USAGE_CSV_SOURCES.flatMap(([sourceKey]) => {
        const usage = row.llmUsage?.[sourceKey];
        return [
          usageCell(usage?.totalLlmCalls),
          usageCell(usage?.totalTokens),
          usageCell(usage?.totalCostUsd),
        ];
      }),
      rowTotal.totalLlmCalls,
      rowTotal.totalTokens,
      rowTotal.totalCostUsd,
    ];
  });

  // TOTALS row: sum every numeric (LLM) column across the exported rows; the
  // leading descriptive columns are left blank apart from the "TOTALS" label.
  const grandTotal = getLlmUsageTotal(dataset.rows);
  const leadingBlankColumns = 24; // columns between "TOTALS" and the first LLM column
  const totalsRow: Array<string | number> = [
    'TOTALS',
    ...Array<string>(leadingBlankColumns).fill(''),
    ...LLM_USAGE_CSV_SOURCES.flatMap(([sourceKey]) => {
      const sourceTotal = dataset.rows.reduce(
        (acc, row) => {
          const usage = row.llmUsage?.[sourceKey];
          if (usage) {
            acc.calls += usage.totalLlmCalls;
            acc.tokens += usage.totalTokens;
            acc.cost += usage.totalCostUsd;
          }
          return acc;
        },
        { calls: 0, tokens: 0, cost: 0 },
      );
      return [sourceTotal.calls, sourceTotal.tokens, sourceTotal.cost];
    }),
    grandTotal.totalLlmCalls,
    grandTotal.totalTokens,
    grandTotal.totalCostUsd,
  ];

  return [headers, ...rows, totalsRow]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
};

// Health summary CSV: one row per source, aggregate counts across all rows.
export const toCsvHealthSummary = (
  rows: SiteOpportunityRow[],
  generatedAt: string,
): string => {
  const headers = ['Source', 'NEW', 'IGNORED', 'PRODUCED', 'NOT_PRODUCED', 'TOTAL', 'COST_USD'];
  const data = sourceEntries.map(([sourceKey, source]) => {
    const visible = rows.filter((r) => r.indicators[sourceKey] === 'visible').length;
    const ignored = rows.filter((r) => r.indicators[sourceKey] === 'ignored').length;
    const produced = visible + ignored;
    const notProduced = rows.length - produced;
    const cost = rows.reduce((sum, r) => sum + (r.llmUsage?.[sourceKey]?.totalCostUsd ?? 0), 0);
    return [source.label, visible, ignored, produced, notProduced, rows.length, cost];
  });

  const meta = [`Generated: ${generatedAt}`, ...Array(headers.length - 1).fill('')];
  return [[...headers], ...data, meta].map((row) => row.map(csvEscape).join(',')).join('\n');
};

// ── LAST-VISIBLE HEALTH SIGNAL ────────────────────────────────────────────────
// Three-tier signal for each source cell, based on:
//   error   — no NEW opportunity ever (pipeline problem)
//   warning — last visible exists but is 2+ ISO weeks ago
//   info    — last visible was produced exactly in the previous ISO week (1 week ago)
//   ok      — last visible was produced in the current ISO week (0 weeks ago)
export type LastVisibleSignal = 'ok' | 'info' | 'warning' | 'error';

export const lastVisibleSignal = (
  allOpps: SpacecatOpportunity[],
): LastVisibleSignal => {
  const newOpps = allOpps.filter((o) => o.status?.toUpperCase() === 'NEW');
  if (newOpps.length === 0) return 'error';

  const lastVisible = newOpps.reduce((latest, o) => {
    const ta = latest.updatedAt ?? latest.createdAt ?? '';
    const tb = o.updatedAt ?? o.createdAt ?? '';
    return tb > ta ? o : latest;
  });

  const weeksAgo = isoWeeksAgo(lastVisible.updatedAt ?? lastVisible.createdAt ?? '');
  if (weeksAgo > 1) return 'warning';
  if (weeksAgo === 1) return 'info';
  return 'ok'; // current week — no icon
};

// ── BRIEF EXPORT FORMAT ────────────────────────────────────────────────────────
// Single file: filters block → health summary → data table (one row per
// site × audit type × in-range opportunity). The filename encodes the
// timestamp so no "Generated At" column is needed in the data rows.

const parseTs = (iso: string | undefined): { week: string; date: string; time: string } => {
  if (!iso) return { week: '', date: '', time: '' };
  return { week: formatWeekLabel(iso), date: iso.slice(0, 10), time: iso.slice(11, 19) };
};

const LAST_VISIBLE_STATUS_TEXT: Record<LastVisibleSignal, string> = {
  ok: 'Last visible opportunity produced in the current week',
  info: 'Last visible opportunity produced in the previous week',
  warning: 'Last visible opportunity is older than 1 week',
  error: 'No visible opportunity ever produced',
};

export const toCsvExportBrief = (
  rows: SiteOpportunityRow[],
  weeks: string[],
  enabledSourceKeys: SourceKey[],
  tiers: string[],
): string => {
  const toLine = (row: (string | number)[]) => row.map(csvEscape).join(',');

  // ── Filters (one item per column) ──────────────────────────────────────────
  const filterLines = [
    ['Weeks', ...(weeks.length === 0 ? ['All weeks'] : weeks)],
    ['Audit Types', ...enabledSourceKeys.map((k) => OPPORTUNITY_SOURCES[k].label)],
    ['Tiers', ...tiers.map((t) => t.charAt(0).toUpperCase() + t.slice(1))],
    ['Sites', ...rows.map((r) => r.baseURL.replace(/^https?:\/\//, ''))],
  ];

  // ── Health stats per source ─────────────────────────────────────────────────
  const stats = enabledSourceKeys.map((key) => {
    const source = OPPORTUNITY_SOURCES[key];
    let visible = 0;
    let ignored = 0;
    let qaHallucinatedCount = 0;
    let qaAnalyzedCount = 0;
    let costNewUsd = 0;
    let costIgnoredUsd = 0;
    let costUsd = 0;
    rows.forEach((row) => {
      const allOpps = row.allOpportunitiesBySource[key] ?? [];
      const result = computeFilteredIndicator(allOpps, source.opportunityType, weeks);
      if (result.indicator === 'visible') visible++;
      else if (result.indicator === 'ignored') ignored++;
      const filteredOpps =
        weeks.length === 0 ? allOpps : allOpps.filter((o) => opportunityTouchedInWeeks(o, weeks));
      filteredOpps.forEach((opp) => {
        const c = extractLlmUsage(opp)?.totalCostUsd ?? 0;
        costUsd += c;
        if (opp.status?.toUpperCase() === 'NEW') costNewUsd += c;
        else if (opp.status?.toUpperCase() === 'IGNORED') costIgnoredUsd += c;
        const qa = extractQaVerdict(opp);
        if (qa?.rateDetermined) {
          qaHallucinatedCount += qa.hallucinatedCount;
          qaAnalyzedCount += qa.analyzedCount;
        }
      });
    });
    const hallRate = qaAnalyzedCount === 0 ? 'N/A' : `${Math.round((qaHallucinatedCount / qaAnalyzedCount) * 100)}%`;
    return {
      label: source.label,
      isMonthly: source.cadence === 'monthly',
      visible,
      ignored,
      notProduced: rows.length - visible - ignored,
      hallRate,
      costNewUsd,
      costIgnoredUsd,
      costUsd,
    };
  });

  const totalVisible = stats.reduce((s, x) => s + x.visible, 0);
  const totalIgnored = stats.reduce((s, x) => s + x.ignored, 0);
  const totalNotProduced = stats.reduce((s, x) => s + x.notProduced, 0);
  const totalProduced = totalVisible + totalIgnored;
  const totalSlots = rows.length * enabledSourceKeys.length;
  const grandTotalCost = stats.reduce((s, x) => s + (x.isMonthly ? 0 : x.costUsd), 0);

  // ── Counts table: blank label col, then Visible / Hidden / Not Produced / Hallucination Rate ─
  const countsHeader = ['', 'Visible', 'Hidden', 'Not Produced', 'Hallucination Rate'];
  const countsRows = stats.map((s) => [s.label, s.visible, s.ignored, s.notProduced, s.hallRate]);

  // ── Totals: one header row + one data row ─────────────────────────────────
  const totalsHeader = ['', 'Total Visible', 'Total Hidden', 'Total Produced', 'Total Not Produced', 'Total Opportunities Target'];
  const totalsData = ['Totals', totalVisible, totalIgnored, totalProduced, totalNotProduced, totalSlots];

  // ── Costs table: blank label col, then costs; Grand Total only on first row
  const costsHeader = ['', 'Cost Visible USD', 'Cost Hidden USD', 'Cost Produced USD', '', 'Grand Total Cost USD'];
  const costsRows = stats.map((s, i) => {
    const costProduced = s.isMonthly ? 'N/A' : s.costNewUsd + s.costIgnoredUsd;
    return [
      s.label,
      s.isMonthly ? 'N/A' : s.costNewUsd,
      s.isMonthly ? 'N/A' : s.costIgnoredUsd,
      costProduced,
      '',
      i === 0 ? grandTotalCost : '',
    ];
  });

  // ── Data table ──────────────────────────────────────────────────────────────
  const dataHeaders = [
    'Site Name', 'Base URL', 'Site ID', 'Organization ID', 'Tier', 'Region',
    'Audit Type', 'Status', 'Week', 'Date', 'Time', 'Cost USD',
    'Last Visible Week', 'Last Visible Date', 'Last Visible Time', 'Last Visible Status',
    'Hallucination Rate', 'Hallucinated Items', 'Analyzed Items',
  ];

  const dataRows: (string | number)[][] = [];

  rows.forEach((row) => {
    enabledSourceKeys.forEach((key) => {
      const source = OPPORTUNITY_SOURCES[key];
      const allOpps = row.allOpportunitiesBySource[key] ?? [];
      const filteredOpps =
        weeks.length === 0 ? allOpps : allOpps.filter((o) => opportunityTouchedInWeeks(o, weeks));

      const newOpps = allOpps.filter((o) => o.status?.toUpperCase() === 'NEW');
      const lastVisibleOpp =
        newOpps.length === 0
          ? null
          : newOpps.reduce((latest, o) => {
              const ta = latest.updatedAt ?? latest.createdAt ?? '';
              const tb = o.updatedAt ?? o.createdAt ?? '';
              return tb > ta ? o : latest;
            });
      const lv = parseTs(lastVisibleOpp?.updatedAt ?? lastVisibleOpp?.createdAt);
      const signal = lastVisibleSignal(allOpps);
      const statusText = LAST_VISIBLE_STATUS_TEXT[signal];

      const siteBase = [
        row.siteName, row.baseURL, row.siteId, row.organizationId,
        row.entitlementTier, row.region ?? '', source.label,
      ];

      if (filteredOpps.length === 0) {
        dataRows.push([...siteBase, 'Not Produced', '', '', '', '', lv.week, lv.date, lv.time, statusText, 'N/A', '', '']);
      } else {
        filteredOpps.forEach((opp) => {
          const isNew = opp.status?.toUpperCase() === 'NEW';
          const isIgnored = opp.status?.toUpperCase() === 'IGNORED';
          const status = isNew ? 'Visible' : isIgnored ? 'Hidden' : (opp.status ?? '');
          const ts = parseTs(opp.updatedAt ?? opp.createdAt);
          const oppCost = source.cadence !== 'monthly' ? (extractLlmUsage(opp)?.totalCostUsd ?? '') : '';
          const qa = source.cadence !== 'monthly' ? extractQaVerdict(opp) : undefined;
          const hallRateCsv = qa
            ? (qa.rateDetermined ? `${Math.round(qa.rate * 100)}%` : 'N/A')
            : (source.cadence === 'monthly' ? 'N/A' : '');
          const hallItems = qa?.rateDetermined ? qa.hallucinatedCount : '';
          const analyzedItems = qa?.rateDetermined ? qa.analyzedCount : '';
          dataRows.push([...siteBase, status, ts.week, ts.date, ts.time, oppCost, lv.week, lv.date, lv.time, statusText, hallRateCsv, hallItems, analyzedItems]);
        });
      }
    });
  });

  return [
    toLine(['Adobe Brand Visibility - Offsite - Operational Brief']),
    '',
    filterLines.map(toLine).join('\n'),
    '',
    [countsHeader, ...countsRows].map(toLine).join('\n'),
    '',
    [totalsHeader, totalsData].map(toLine).join('\n'),
    '',
    [costsHeader, ...costsRows].map(toLine).join('\n'),
    '',
    [dataHeaders, ...dataRows].map(toLine).join('\n'),
  ].join('\n');
};

// ── LEGACY EXPORT FORMAT (kept for backward-compat) ──────────────────────────
// Sites table CSV: one row per site.
export const toCsvSitesTable = (dataset: DashboardDataset, enabledSourceKeys?: SourceKey[], weeks: string[] = []): string => {
  const allSourceKeys = sourceEntries.map(([k]) => k);
  const sourceKeyOrder = enabledSourceKeys
    ? allSourceKeys.filter((k) => enabledSourceKeys.includes(k))
    : allSourceKeys;
  const headers = [
    'Site',
    'Base URL',
    'Site ID',
    'Organization ID',
    'Region',
    ...sourceKeyOrder.flatMap((k) => [
      OPPORTUNITY_SOURCES[k].label,
      `${OPPORTUNITY_SOURCES[k].label} date`,
    ]),
    'Total cost USD',
    'Tier',
    'Customer group',
    'Semrush',
    'Generated at',
  ];

  const dataRows = dataset.rows.map((row) => [
    row.siteName,
    row.baseURL,
    row.siteId,
    row.organizationId,
    row.region ?? '',
    ...sourceKeyOrder.flatMap((k) => [
      row.indicators[k],
      row.opportunityDates[k],
    ]),
    computeFilteredRowCost(row, weeks, sourceKeyOrder),
    row.entitlementTier,
    row.customerGroup,
    row.hasSemrush === undefined ? '' : row.hasSemrush ? 'yes' : 'no',
    dataset.generatedAt,
  ]);

  return [headers, ...dataRows].map((row) => row.map(csvEscape).join(',')).join('\n');
};
