import { describe, expect, it } from 'vitest';
import type { SpacecatOpportunity } from '../types';
import {
  buildSiteRow,
  customerGroupFromTier,
  getOverviewCounts,
  groupRows,
  indicatorFromOpportunities,
  isLlmoSite,
  toCsv,
} from './dashboard';

const site = {
  id: 'site-1',
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
  siteId: 'site-1',
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

  it('uses the creation date when a source has a single opportunity', () => {
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
      date: '2026-06-01T00:00:00.000Z',
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
          id: 'site-6',
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
