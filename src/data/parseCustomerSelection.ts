export const parseCustomerSelection = (input: unknown) => {
  const strings = (key: string): string[] => {
    if (typeof input !== 'object' || input === null || !(key in input)) {
      throw new Error(`Customer selection requires ${key}`);
    }
    const values: unknown = Reflect.get(input, key);
    if (!Array.isArray(values) || !values.every(
      (value: unknown) => typeof value === 'string' && value.trim().length > 0,
    )) {
      throw new Error(`Customer selection ${key} must be an array of non-empty strings`);
    }
    return values.map((value: string) => value.trim());
  };

  if (input === undefined) {
    return {
      paidSiteIds: [],
      internalTestCustomers: [],
      securityProbeSites: [],
      internalTestOrganizations: [],
    };
  }

  return {
    paidSiteIds: strings('paidSiteIds'),
    internalTestCustomers: strings('internalTestCustomers'),
    securityProbeSites: strings('securityProbeSites'),
    internalTestOrganizations: strings('internalTestOrganizations'),
  };
};
