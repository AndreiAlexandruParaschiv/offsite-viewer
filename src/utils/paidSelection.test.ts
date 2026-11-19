import { describe, expect, it, vi } from 'vitest';
import { buildSiteRow, groupRows, isInternalTestCustomer, isPaidCustomerSite } from './dashboard';

vi.mock('../data/customerSelection', () => ({
  CUSTOMER_SELECTION: {
    paidSiteIds: ['site-paid', 'site-demo'],
    internalTestCustomers: ['release notes', 'https://demo.example', 'preview.example'],
    securityProbeSites: ['https://probe.example/saved/path'],
    internalTestOrganizations: ['org-internal'],
  },
}));

const site = {
  id: 'site-paid',
  baseURL: 'https://customer.example',
  name: 'Customer',
  organizationId: 'org-customer',
  config: { llmo: { dataFolder: 'customer' } },
};
const paid = [{
  id: 'ent-paid', organizationId: 'org-customer', productCode: 'LLMO', tier: 'PAID',
}];

describe('Paid customer selection', () => {
  it('requires local membership, current LLMO PAID entitlement and LLMO configuration', () => {
    expect(isPaidCustomerSite(site, paid)).toBe(true);
    expect(isPaidCustomerSite({ ...site, id: 'site-removed' }, paid)).toBe(false);
    expect(isPaidCustomerSite({ ...site, config: null }, paid)).toBe(false);
    expect(isPaidCustomerSite({ ...site, config: {} }, paid)).toBe(false);
    expect(isPaidCustomerSite(site, [])).toBe(false);
    expect(isPaidCustomerSite(site, [{ ...paid[0], tier: 'FREE_TRIAL' }])).toBe(false);
    expect(isPaidCustomerSite(site, [{ ...paid[0], productCode: 'ASO' }])).toBe(false);
    expect(buildSiteRow({
      site: { ...site, id: 'site-removed' }, entitlements: paid, opportunities: [],
    }).customerGroup).toBe('trial');
  });

  it.each([
    'https://demo.example',
    'http://DEMO.example/another/path',
    'demo.example/path',
    'https://preview.example/some/path',
    'http://probe.example/a/different/path',
  ])('excludes configured hosts before Paid loading and from both tables: %s', (baseURL) => {
    const candidate = { ...site, id: 'site-demo', baseURL };
    expect(isPaidCustomerSite(candidate, paid)).toBe(false);
    const rows = [paid, [{ ...paid[0], tier: 'FREE_TRIAL' }]].map((entitlements) =>
      buildSiteRow({ site: candidate, entitlements, opportunities: [] }),
    );
    expect(groupRows(rows).paid).toEqual([]);
    expect(groupRows(rows).trial).toEqual([]);
  });

  it('excludes configured names and organizations independently of hostname', () => {
    expect(isPaidCustomerSite({ ...site, name: ' Release Notes ' }, paid)).toBe(false);
    expect(isPaidCustomerSite({ ...site, organizationId: 'org-internal' }, paid)).toBe(false);
  });

  it.each([
    'https://demo.example.customer.example',
    'https://customer.example/demo.example',
    'https://sub.demo.example',
    'not a URL',
  ])('does not use hostname substrings or infer exclusions from names: %s', (baseURL) => {
    expect(isInternalTestCustomer({
      baseURL, siteName: 'Demo customer', organizationId: 'org-customer',
    })).toBe(false);
  });
});
