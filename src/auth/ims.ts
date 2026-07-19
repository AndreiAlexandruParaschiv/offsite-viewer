/**
 * Adobe IMS sign-in via the standard OAuth 2.0 Authorization Code + PKCE
 * flow — the flow Adobe's own docs document as supported for a self-service
 * "OAuth Single Page App" Developer Console credential.
 *
 * Deliberately NOT using `imslib` (the auth.services.adobe.com script used by
 * first-party Adobe properties like elmo-ui): its background session-check
 * call to adobeid-na1.services.adobe.com is a proprietary, CORS-restricted
 * endpoint that isn't opened up for arbitrary self-registered SPA clients.
 * A top-level redirect isn't subject to CORS at all, which is why PKCE works
 * where imslib's XHR-based check didn't.
 */

const ACCESS_TOKEN_STORAGE_KEY = 'offsite-viewer.ims.accessToken';
const CODE_VERIFIER_STORAGE_KEY = 'offsite-viewer.ims.codeVerifier';
const OAUTH_STATE_STORAGE_KEY = 'offsite-viewer.ims.state';

// Must match exactly the scopes granted to this client in Adobe Developer
// Console (AEM CS Sites Content Management API product).
const SCOPE = 'aem.folders,AdobeID,aem.fragments.management,openid';

const IMS_HOST_BY_ENVIRONMENT: Record<'prod' | 'stage', string> = {
  prod: 'https://ims-na1.adobelogin.com',
  stage: 'https://ims-na1-stg1.adobelogin.com',
};

interface StoredAccessToken {
  token: string;
  expiresAt: number;
}

const getConfig = () => {
  const clientId = import.meta.env.VITE_IMS_CLIENT_ID;
  const environment = import.meta.env.VITE_IMS_ENVIRONMENT === 'stage' ? 'stage' : 'prod';

  if (!clientId) {
    throw new Error('VITE_IMS_CLIENT_ID is not configured');
  }

  return { clientId, imsHost: IMS_HOST_BY_ENVIRONMENT[environment] };
};

const base64UrlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomString = (): string => base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);

const codeChallengeFor = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
};

const readStoredAccessToken = (): StoredAccessToken | null => {
  const raw = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredAccessToken;
    if (parsed.expiresAt > Date.now() + 60_000) {
      return parsed;
    }
  } catch {
    // fall through to treat as missing
  }

  sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  return null;
};

const storeAccessToken = (token: string, expiresInSeconds: number) => {
  const stored: StoredAccessToken = { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
  sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, JSON.stringify(stored));
};

const exchangeCodeForToken = async (code: string): Promise<void> => {
  const { clientId, imsHost } = getConfig();
  const verifier = sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY) ?? '';
  sessionStorage.removeItem(CODE_VERIFIER_STORAGE_KEY);

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  const response = await fetch(`${imsHost}/ims/token/v3?client_id=${encodeURIComponent(clientId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`IMS token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  storeAccessToken(data.access_token, data.expires_in);
};

// Consumes ?code=&state= from the current URL (present after IMS redirects
// back), validates state, exchanges the code for a token, and strips the
// OAuth params from the URL either way so a reload can't replay a spent code.
const consumeAuthCallback = async (): Promise<void> => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return;
  }

  const expectedState = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);

  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.toString());

  if (!state || state !== expectedState) {
    throw new Error('IMS sign-in failed: state mismatch');
  }

  await exchangeCodeForToken(code);
};

let initPromise: Promise<void> | null = null;

const ensureInit = (): Promise<void> => {
  if (!initPromise) {
    initPromise = consumeAuthCallback().catch((error: unknown) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
};

export const isImsSignedIn = async (): Promise<boolean> => {
  await ensureInit();
  return readStoredAccessToken() !== null;
};

export const signInWithIms = async (): Promise<void> => {
  const { clientId, imsHost } = getConfig();
  const verifier = randomString();
  const state = randomString();
  const challenge = await codeChallengeFor(verifier);

  sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/`,
    scope: SCOPE,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.assign(`${imsHost}/ims/authorize/v2?${params.toString()}`);
};

export const signOutOfIms = async (): Promise<void> => {
  sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
};

export const getImsAccessToken = async (): Promise<string> => {
  await ensureInit();
  const stored = readStoredAccessToken();

  if (!stored) {
    throw new Error('Not signed in to Adobe');
  }

  return stored.token;
};
