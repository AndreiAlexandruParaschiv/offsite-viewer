import { describe, expect, it } from 'vitest';
import { parseCustomerSelection } from './parseCustomerSelection';

const selection = {
  paidSiteIds: ['site-paid'],
  internalTestCustomers: ['https://demo.example'],
  securityProbeSites: [],
  internalTestOrganizations: [],
};

describe('local customer selection', () => {
  it('uses empty lists when no local configuration exists', () => {
    expect(parseCustomerSelection(undefined)).toEqual({
      paidSiteIds: [],
      internalTestCustomers: [],
      securityProbeSites: [],
      internalTestOrganizations: [],
    });
  });

  it('loads the supplied snapshot without filtering individual sites', () => {
    expect(parseCustomerSelection({
      ...selection,
      paidSiteIds: [' site-paid ', 'site-demo'],
    })).toEqual({ ...selection, paidSiteIds: ['site-paid', 'site-demo'] });
  });

  it.each([null, [], {}, 'invalid'])('rejects malformed configuration %j', (input) => {
    expect(() => parseCustomerSelection(input)).toThrow('Customer selection');
  });

  it.each(['paidSiteIds', 'internalTestCustomers', 'securityProbeSites', 'internalTestOrganizations'])(
    'rejects invalid entries in %s without echoing their contents',
    (key) => {
      for (const value of [null, 'private-value', [12], [''], ['  '], [{}]]) {
        expect(() => parseCustomerSelection({ ...selection, [key]: value }))
          .toThrow(`Customer selection ${key} must be an array of non-empty strings`);
      }
    },
  );
});
