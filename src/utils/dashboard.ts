import { PAID_SITE_ID_ALLOWLIST } from '../data/paidSiteAllowlist';
import {
  OPPORTUNITY_SOURCES,
  type CustomerGroup,
  type DashboardDataset,
  type LlmUsage,
  type MissingOpportunityInfo,
  type OpportunityIndicator,
  type SiteOpportunityRow,
  type SourceCadence,
  type SourceKey,
  type SpacecatAudit,
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

// Explains a "missing" source using its own latest audit (GET
// /sites/{siteId}/latest-audit/{auditType}, same auditType as
// OPPORTUNITY_SOURCES[key].opportunityType): 'audit-error' when the audit
// itself failed (auditResult.success === false, with its own error message);
// 'no-opportunity' when the audit ran fine but produced no opportunity —
// opportunity creation happens asynchronously via Mystique after a
// successful audit, so this is a normal, non-failure outcome, not a bug.
// Returns undefined when the source isn't "missing" or no audit record
// exists at all (never run).
export const explainMissingOpportunity = (
  indicator: OpportunityIndicator,
  audit: SpacecatAudit | null,
): MissingOpportunityInfo | undefined => {
  if (indicator !== 'missing' || !audit?.auditResult) {
    return undefined;
  }

  if (audit.auditResult.success === false) {
    return { kind: 'audit-error', detail: audit.auditResult.error, auditedAt: audit.auditedAt };
  }

  return { kind: 'no-opportunity', auditedAt: audit.auditedAt };
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
  const llmUsage: Partial<Record<SourceKey, LlmUsage>> = {};

  sourceEntries.forEach(([sourceKey, source]) => {
    const result = indicatorFromOpportunities(opportunities, source.opportunityType);
    indicators[sourceKey] = result.indicator;
    opportunityIds[sourceKey] = result.opportunityId;
    opportunityDates[sourceKey] = result.date;
    if (result.llmUsage) {
      llmUsage[sourceKey] = result.llmUsage;
    }
  });

  return {
    siteId: site.id,
    siteName: site.name || site.baseURL,
    baseURL: site.baseURL,
    organizationId: site.organizationId,
    region: site.region ?? null,
    customerGroup: resolveCustomerGroup(entitlementTier, site.id),
    entitlementTier,
    indicators,
    opportunityIds,
    opportunityDates,
    llmUsage,
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

export interface LlmUsageAverage {
  // How many opportunities of this source actually carried usage — the
  // denominator, so a source with none reads as count 0 rather than a
  // divide-by-zero.
  count: number;
  avgLlmCalls: number;
  avgTokens: number;
  avgCostUsd: number;
}

// Per-source averages (cost + calls) over the opportunities that carry usage,
// across a set of rows. Averaged per opportunity-with-usage (not per row), so
// wikipedia — which is never tracked — comes back as count 0 / all zeros.
export const getSourceLlmAverages = (
  rows: SiteOpportunityRow[],
): Record<SourceKey, LlmUsageAverage> =>
  sourceEntries.reduce((averages, [sourceKey]) => {
    let count = 0;
    let calls = 0;
    let tokens = 0;
    let cost = 0;

    rows.forEach((row) => {
      const usage = row.llmUsage?.[sourceKey];
      if (usage) {
        count += 1;
        calls += usage.totalLlmCalls;
        tokens += usage.totalTokens;
        cost += usage.totalCostUsd;
      }
    });

    averages[sourceKey] = count
      ? { count, avgLlmCalls: calls / count, avgTokens: tokens / count, avgCostUsd: cost / count }
      : { count: 0, avgLlmCalls: 0, avgTokens: 0, avgCostUsd: 0 };
    return averages;
  }, {} as Record<SourceKey, LlmUsageAverage>);

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

export interface AuditCoverage {
  totalSlots: number;
  // visible/ignored means an opportunity exists, which is only possible if
  // the underlying audit ran and succeeded — no separate audit check needed.
  ranWithOpportunity: number;
  // "missing" sources only: broken down by what their own latest-audit
  // record (fetched via fetchMissingInfo, paid rows only) actually says.
  ranErrored: number;
  ranNoOpportunity: number;
  // "missing" with no audit record at all, or missingInfo was never fetched
  // for this row (e.g. a trial/free row, where it's paid-only) — can't tell
  // "genuinely never ran" apart from "not checked" from the data available.
  neverRanOrUnknown: number;
}

// Answers "did every audit actually run?" across a set of rows. Only
// meaningful for rows whose missingInfo has actually been fetched (paid
// rows) — trial/free rows always fall into neverRanOrUnknown since that
// check is paid-only.
//
// An optional cadence restricts which sources count — e.g. 'weekly' scopes
// to reddit/youtube/cited only, since mixing in monthly wikipedia runs would
// skew a "did this week's audits run" question.
export const getAuditCoverage = (rows: SiteOpportunityRow[], cadence?: SourceCadence): AuditCoverage => {
  const entries = cadence ? sourceEntries.filter(([, source]) => source.cadence === cadence) : sourceEntries;

  let ranWithOpportunity = 0;
  let ranErrored = 0;
  let ranNoOpportunity = 0;
  let neverRanOrUnknown = 0;

  rows.forEach((row) => {
    entries.forEach(([sourceKey]) => {
      const indicator = row.indicators[sourceKey];

      if (indicator === 'visible' || indicator === 'ignored') {
        ranWithOpportunity += 1;
        return;
      }

      const info = row.missingInfo?.[sourceKey];
      if (info?.kind === 'audit-error') {
        ranErrored += 1;
      } else if (info?.kind === 'no-opportunity') {
        ranNoOpportunity += 1;
      } else {
        neverRanOrUnknown += 1;
      }
    });
  });

  return {
    totalSlots: rows.length * entries.length,
    ranWithOpportunity,
    ranErrored,
    ranNoOpportunity,
    neverRanOrUnknown,
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

export interface SourceInsight {
  visible: number;
  // Visible AND has at least one suggestion — the actionable subset.
  // suggestionCounts is only fetched for Paid rows, so this is meaningful for
  // Paid only; on rows without counts it reads as 0.
  visibleWithSuggestions: number;
  ignored: number;
}

// Per-source counts beyond the plain visible tally: how many visible
// opportunities actually carry suggestions, and how many are ignored. Meant
// to be run over a single group's rows (e.g. Paid).
export const getSourceInsights = (
  rows: SiteOpportunityRow[],
): Record<SourceKey, SourceInsight> =>
  sourceEntries.reduce((insights, [sourceKey]) => {
    let visible = 0;
    let visibleWithSuggestions = 0;
    let ignored = 0;

    rows.forEach((row) => {
      const indicator = row.indicators[sourceKey];
      if (indicator === 'visible') {
        visible += 1;
        if ((row.suggestionCounts?.[sourceKey] ?? 0) > 0) {
          visibleWithSuggestions += 1;
        }
      } else if (indicator === 'ignored') {
        ignored += 1;
      }
    });

    insights[sourceKey] = { visible, visibleWithSuggestions, ignored };
    return insights;
  }, {} as Record<SourceKey, SourceInsight>);

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
    'Region accepted (audit)',
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
      (() => {
        const accepted = isAcceptedRegion(row.region);
        return accepted === undefined ? '' : accepted ? 'yes' : 'no';
      })(),
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
  const leadingBlankColumns = 22; // columns between "TOTALS" and the first LLM column
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
