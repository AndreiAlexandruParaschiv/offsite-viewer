import type { SpacecatEntitlement, SpacecatOpportunity, SpacecatSite } from '../types';

interface SitesPagedResponse {
  sites: SpacecatSite[];
  pagination?: {
    cursor?: string | null;
    hasMore?: boolean;
  };
}

interface SpacecatClientOptions {
  baseUrl: string;
  token: string;
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const readErrorBody = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return response.statusText;
  }

  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message ?? json.error ?? text;
  } catch {
    return text;
  }
};

export const exchangeImsAccessToken = async (baseUrl: string, imsAccessToken: string): Promise<string> => {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken: imsAccessToken }),
  });

  if (!response.ok) {
    const message = await readErrorBody(response);
    throw new Error(`${response.status} ${message}`);
  }

  const { sessionToken } = (await response.json()) as { sessionToken: string };
  return sessionToken;
};

export class SpacecatClient {
  private readonly baseUrl: string;

  private readonly token: string;

  constructor({ baseUrl, token }: SpacecatClientOptions) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token.trim().replace(/^Bearer\s+/i, '');
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const message = await readErrorBody(response);
      throw new Error(`${response.status} ${message}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async getAllSites(): Promise<SpacecatSite[]> {
    const allSites: SpacecatSite[] = [];
    let cursor: string | null | undefined;

    do {
      const searchParams = new URLSearchParams({ limit: '500' });
      if (cursor) {
        searchParams.set('cursor', cursor);
      }

      const response = await this.request<SitesPagedResponse | SpacecatSite[]>(
        `/sites?${searchParams.toString()}`,
      );

      if (Array.isArray(response)) {
        allSites.push(...response);
        cursor = null;
      } else {
        allSites.push(...response.sites);
        cursor = response.pagination?.hasMore ? response.pagination?.cursor : null;
      }
    } while (cursor);

    return allSites;
  }

  async getSiteOpportunities(siteId: string): Promise<SpacecatOpportunity[]> {
    return this.request<SpacecatOpportunity[]>(`/sites/${encodeURIComponent(siteId)}/opportunities`);
  }

  async getEntitlements(organizationId: string): Promise<SpacecatEntitlement[]> {
    return this.request<SpacecatEntitlement[]>(
      `/organizations/${encodeURIComponent(organizationId)}/entitlements`,
    );
  }
}
