import { describe, expect, it } from 'vitest';
import type { SpacecatOpportunity } from '../types';
import {
  buildSiteRow,
  computeFilteredIndicator,
  customerGroupFromTier,
  getOverviewCounts,
  groupRows,
  indicatorFromOpportunities,
  isLlmoSite,
  toCsv,
  toCsvHealthSummary,
  toCsvSitesTable,
} from './dashboard';

// A real site ID from PAID_SITE_ID_ALLOWLIST (src/data/paidSiteAllowlist.ts)
// so buildSiteRow's PAID-tier tests actually land in the 'paid' group rather
// than being demoted to 'trial' as an unlisted site would be.
const ALLOWLISTED_SITE_ID = '5d50aa04-f1cf-42be-83f8-555524b9ae28';

const site = {
  id: ALLOWLISTED_SITE_ID,
  baseURL: 'https://example.com',
  name: 'Example',
  organizationId: 'org-1',
  config: { llmo: { dataFolder: 'example' } },
};

const opportunity = (
  type: string,
  status: string,
  id = `${type}-${status}`,
  dates: { createdAt?: string; updatedAt?: string } = {},
): SpacecatOpportunity => ({
  id,
  siteId: ALLOWLISTED_SITE_ID,
  type,
  status,
  ...dates,
});

describe('dashboard transforms', () => {
  it('detects LLMO sites from list config', () => {
    expect(isLlmoSite(site)).toBe(true);
    expect(isLlmoSite({ ...site, config: null })).toBe(false);
  });

  it('prefers visible new opportunities over ignored opportunities', () => {
    expect(
      indicatorFromOpportunities(
        [
          opportunity('reddit-analysis', 'IGNORED', 'reddit-old', {
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
          opportunity('reddit-analysis', 'NEW', 'reddit-new', {
            updatedAt: '2026-06-10T00:00:00.000Z',
          }),
        ],
        'reddit-analysis',
      ),
    ).toEqual({
      indicator: 'visible',
      opportunityId: 'reddit-new',
      date: '2026-06-10T00:00:00.000Z',
    });
  });

  it('shows ignored only when no visible opportunity exists', () => {
    expect(
      indicatorFromOpportunities([opportunity('youtube-analysis', 'IGNORED')], 'youtube-analysis'),
    ).toEqual({ indicator: 'ignored', opportunityId: 'youtube-analysis-IGNORED', date: '' });
  });

  it('uses the latest update date, not the creation date, for a single opportunity', () => {
    expect(
      indicatorFromOpportunities(
        [
          opportunity('cited-analysis', 'NEW', 'cited-only', {
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-20T00:00:00.000Z',
          }),
        ],
        'cited-analysis',
      ),
    ).toEqual({
      indicator: 'visible',
      opportunityId: 'cited-only',
      date: '2026-06-20T00:00:00.000Z',
    });
  });

  it('maps entitlement tiers into customer groups', () => {
    expect(customerGroupFromTier('PAID')).toBe('paid');
    expect(customerGroupFromTier('FREE_TRIAL')).toBe('trial');
    expect(customerGroupFromTier('PLG')).toBe('free');
    expect(customerGroupFromTier(undefined)).toBe('free');
  });

  it('builds rows and overview counts from source opportunities', () => {
    const row = buildSiteRow({
      site,
      entitlements: [
        { id: 'ent-1', organizationId: 'org-1', productCode: 'LLMO', tier: 'PAID' },
      ],
      opportunities: [
        opportunity('reddit-analysis', 'NEW'),
        opportunity('youtube-analysis', 'IGNORED'),
        opportunity('cited-analysis', 'RESOLVED'),
        opportunity('wikipedia-analysis', 'NEW'),
      ],
    });

    expect(row.customerGroup).toBe('paid');
    expect(row.indicators).toMatchObject({
      reddit: 'visible',
      youtube: 'ignored',
      cited: 'missing',
      wikipedia: 'visible',
    });
    expect(getOverviewCounts([row])).toEqual({
      reddit: 1,
      youtube: 0,
      cited: 0,
      wikipedia: 1,
    });
  });

  it('excludes internal test customers from the paid group', () => {
    const paidEntitlements = [
      { id: 'ent-1', organizationId: 'org-1', productCode: 'LLMO', tier: 'PAID' },
    ];
    const rows = [
      buildSiteRow({
        site: { ...site, name: 'LLMO Release Notes' },
        entitlements: paidEntitlements,
        opportunities: [],
      }),
      buildSiteRow({
        site: {
          ...site,
          id: 'site-2',
          baseURL: 'https://test-tokowaka.testaemcloud.com/',
          name: 'Tokowaka test',
        },
        entitlements: paidEntitlements,
        opportunities: [],
      }),
      buildSiteRow({
        site: {
          ...site,
          id: 'site-3',
          baseURL: 'https://optimize-at-edge.testaemcloud.com/',
          name: 'Optimize at Edge',
        },
        entitlements: paidEntitlements,
        opportunities: [],
      }),
      buildSiteRow({
        site: {
          ...site,
          id: 'site-4',
          baseURL: 'https://tokowaka.now',
          name: 'Tokowaka now',
        },
        entitlements: paidEntitlements,
        opportunities: [],
      }),
      buildSiteRow({
        site: {
          ...site,
          id: 'site-5',
          baseURL: 'https://buzios-vibe.com/',
          name: 'Buzios Vibe',
        },
        entitlements: paidEntitlements,
        opportunities: [],
      }),
      buildSiteRow({
        site: {
          ...site,
          // A second real allowlisted ID (accesscorp.com) — must differ from
          // ALLOWLISTED_SITE_ID so this row isn't just a duplicate.
          id: '019e9871-8ee8-7856-803d-348f9324cf7f',
          baseURL: 'https://customer.example.com',
          name: 'Customer',
        },
        entitlements: paidEntitlements,
        opportunities: [],
      }),
    ];

    expect(groupRows(rows).paid.map((row) => row.siteName)).toEqual(['Customer']);
  });

  it('exports current rows to CSV', () => {
    const row = buildSiteRow({
      site: { ...site, name: 'Example, Inc.' },
      entitlements: [],
      opportunities: [opportunity('reddit-analysis', 'NEW')],
    });

    const csv = toCsv({ rows: [row], generatedAt: '2026-06-19T10:00:00.000Z' });
    expect(csv).toContain('"Example, Inc."');
    expect(csv).toContain('visible');
  });
});

describe('buildSiteRow — allOpportunitiesBySource', () => {
  it('stores all opportunities grouped by source', () => {
    const opps = [
      opportunity('reddit-analysis', 'NEW', 'r1'),
      opportunity('reddit-analysis', 'IGNORED', 'r2'),
      opportunity('cited-analysis', 'NEW', 'c1'),
    ];
    const row = buildSiteRow({ site, opportunities: opps, entitlements: [] });
    expect(row.allOpportunitiesBySource.reddit).toHaveLength(2);
    expect(row.allOpportunitiesBySource.reddit.map((o) => o.id)).toEqual(['r1', 'r2']);
    expect(row.allOpportunitiesBySource.cited).toHaveLength(1);
    expect(row.allOpportunitiesBySource.youtube).toHaveLength(0);
    expect(row.allOpportunitiesBySource.wikipedia).toHaveLength(0);
  });
});

describe('computeFilteredIndicator', () => {
  it('returns visible when a NEW opportunity falls in the selected week', () => {
    const opps = [
      opportunity('reddit-analysis', 'NEW', 'r1', { updatedAt: '2026-08-12T10:00:00.000Z' }),
    ];
    expect(computeFilteredIndicator(opps, 'reddit-analysis', ['W33 2026']).indicator).toBe('visible');
  });

  it('returns missing when the NEW opportunity is outside the week filter', () => {
    const opps = [
      opportunity('reddit-analysis', 'NEW', 'r1', { updatedAt: '2026-08-01T10:00:00.000Z' }),
    ];
    expect(computeFilteredIndicator(opps, 'reddit-analysis', ['W33 2026']).indicator).toBe('missing');
  });

  it('returns visible when weeks is empty (no filter)', () => {
    const opps = [
      opportunity('reddit-analysis', 'NEW', 'r1', { updatedAt: '2020-01-01T00:00:00.000Z' }),
    ];
    expect(computeFilteredIndicator(opps, 'reddit-analysis', []).indicator).toBe('visible');
  });
});

describe('toCsvHealthSummary', () => {
  it('produces a CSV with one row per source plus header and metadata', () => {
    const opps = [opportunity('cited-analysis', 'NEW', 'c1')];
    const row = buildSiteRow({ site, opportunities: opps, entitlements: [] });
    const csv = toCsvHealthSummary([row], '2026-08-12T00:00:00.000Z');
    const lines = csv.split('\n');
    // header + 4 source rows + metadata = 6
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain('Source');
    expect(lines[0]).toContain('NEW');
    const citedLine = lines.find((l) => l.startsWith('Cited'));
    expect(citedLine).toBeTruthy();
  });

  it('returns a string', () => {
    const csv = toCsvHealthSummary([], '2026-08-12T00:00:00.000Z');
    expect(typeof csv).toBe('string');
  });

  it('includes all four sources as rows', () => {
    const csv = toCsvHealthSummary([], '2026-08-12T00:00:00.000Z');
    const lines = csv.split('\n');
    // header + 4 source rows + metadata = 6
    expect(lines).toHaveLength(6);
    const sourceLabels = lines.slice(1, 5).map((l) => l.split(',')[0]);
    expect(sourceLabels).toContain('Reddit');
    expect(sourceLabels).toContain('YouTube');
    expect(sourceLabels).toContain('Cited');
    expect(sourceLabels).toContain('Wikipedia');
  });

  it('includes generatedAt in the output', () => {
    const generatedAt = '2026-08-12T00:00:00.000Z';
    const csv = toCsvHealthSummary([], generatedAt);
    expect(csv).toContain(generatedAt);
  });

  it('returns all-zero counts for an empty rows array', () => {
    const csv = toCsvHealthSummary([], '2026-08-12T00:00:00.000Z');
    const lines = csv.split('\n');
    // Each source data row (lines 1-4): Source,0,0,0,0,0,0
    for (const line of lines.slice(1, 5)) {
      const cells = line.split(',');
      // NEW, IGNORED, PRODUCED, NOT_PRODUCED, TOTAL, COST_USD all 0
      expect(cells.slice(1)).toEqual(['0', '0', '0', '0', '0', '0']);
    }
  });

  it('counts NEW, IGNORED, PRODUCED, NOT_PRODUCED, TOTAL correctly', () => {
    const newRow = buildSiteRow({
      site: { ...site, id: 'site-a', baseURL: 'https://a.com', name: 'A' },
      opportunities: [opportunity('reddit-analysis', 'NEW', 'r-new')],
      entitlements: [],
    });
    const ignoredRow = buildSiteRow({
      site: { ...site, id: 'site-b', baseURL: 'https://b.com', name: 'B' },
      opportunities: [opportunity('reddit-analysis', 'IGNORED', 'r-ignored')],
      entitlements: [],
    });
    const missingRow = buildSiteRow({
      site: { ...site, id: 'site-c', baseURL: 'https://c.com', name: 'C' },
      opportunities: [],
      entitlements: [],
    });
    const csv = toCsvHealthSummary([newRow, ignoredRow, missingRow], '2026-08-12T00:00:00.000Z');
    const lines = csv.split('\n');
    const redditLine = lines.find((l) => l.startsWith('Reddit'));
    expect(redditLine).toBeTruthy();
    const cells = redditLine!.split(',');
    // Source, NEW=1, IGNORED=1, PRODUCED=2, NOT_PRODUCED=1, TOTAL=3, COST_USD=0
    expect(cells[1]).toBe('1'); // NEW
    expect(cells[2]).toBe('1'); // IGNORED
    expect(cells[3]).toBe('2'); // PRODUCED
    expect(cells[4]).toBe('1'); // NOT_PRODUCED
    expect(cells[5]).toBe('3'); // TOTAL
  });

  it('includes a header row with expected column names', () => {
    const csv = toCsvHealthSummary([], '2026-08-12T00:00:00.000Z');
    const header = csv.split('\n')[0];
    expect(header).toContain('Source');
    expect(header).toContain('NEW');
    expect(header).toContain('IGNORED');
    expect(header).toContain('PRODUCED');
    expect(header).toContain('TOTAL');
    expect(header).toContain('COST_USD');
  });

  it('wikipedia cost is zero when no llmUsage is present', () => {
    const row = buildSiteRow({
      site,
      opportunities: [opportunity('wikipedia-analysis', 'NEW', 'w1')],
      entitlements: [],
    });
    const csv = toCsvHealthSummary([row], '2026-08-12T00:00:00.000Z');
    const lines = csv.split('\n');
    const wikiLine = lines.find((l) => l.startsWith('Wikipedia'));
    expect(wikiLine).toBeTruthy();
    const cells = wikiLine!.split(',');
    // COST_USD (last column) is 0 since wikipedia carries no llmUsage
    expect(Number(cells[cells.length - 1])).toBe(0);
  });
});

describe('toCsvSitesTable', () => {
  it('produces a CSV with header + one data row per site', () => {
    const opps = [opportunity('reddit-analysis', 'NEW', 'r1')];
    const row = buildSiteRow({ site, opportunities: opps, entitlements: [] });
    const csv = toCsvSitesTable({ rows: [row], generatedAt: '2026-08-12T00:00:00.000Z' });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain('example.com');
  });

  it('returns a string', () => {
    const csv = toCsvSitesTable({ rows: [], generatedAt: '2026-08-12T00:00:00.000Z' });
    expect(typeof csv).toBe('string');
  });

  it('returns at least a header row for an empty dataset', () => {
    const csv = toCsvSitesTable({ rows: [], generatedAt: '2026-08-12T00:00:00.000Z' });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Site');
  });

  it('includes tier, customer group, and region columns in the header', () => {
    const csv = toCsvSitesTable({ rows: [], generatedAt: '2026-08-12T00:00:00.000Z' });
    const header = csv.split('\n')[0];
    expect(header).toContain('Tier');
    expect(header).toContain('Customer group');
    expect(header).toContain('Region');
  });

  it('includes all four source columns in the header', () => {
    const csv = toCsvSitesTable({ rows: [], generatedAt: '2026-08-12T00:00:00.000Z' });
    const header = csv.split('\n')[0];
    expect(header).toContain('Reddit');
    expect(header).toContain('YouTube');
    expect(header).toContain('Cited');
    expect(header).toContain('Wikipedia');
  });

  it('produces one data row per site for multiple sites', () => {
    const rows = [
      buildSiteRow({
        site: { ...site, id: 'site-a', baseURL: 'https://a.com', name: 'A' },
        opportunities: [],
        entitlements: [],
      }),
      buildSiteRow({
        site: { ...site, id: 'site-b', baseURL: 'https://b.com', name: 'B' },
        opportunities: [],
        entitlements: [],
      }),
    ];
    const csv = toCsvSitesTable({ rows, generatedAt: '2026-08-12T00:00:00.000Z' });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[1]).toContain('a.com');
    expect(lines[2]).toContain('b.com');
  });

  it('includes the indicator status in data rows', () => {
    const row = buildSiteRow({
      site,
      opportunities: [
        opportunity('reddit-analysis', 'NEW', 'r1'),
        opportunity('youtube-analysis', 'IGNORED', 'y1'),
      ],
      entitlements: [],
    });
    const csv = toCsvSitesTable({ rows: [row], generatedAt: '2026-08-12T00:00:00.000Z' });
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain('visible');
    expect(dataRow).toContain('ignored');
    expect(dataRow).toContain('missing');
  });

  it('includes generatedAt in data rows', () => {
    const generatedAt = '2026-08-12T00:00:00.000Z';
    const row = buildSiteRow({ site, opportunities: [], entitlements: [] });
    const csv = toCsvSitesTable({ rows: [row], generatedAt });
    expect(csv).toContain(generatedAt);
  });
});
