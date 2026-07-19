/**
 * Adobe IMS sign-in, loaded via the public imslib script tag rather than the
 * `@identity/imslib` npm package (Adobe-internal registry, not installable here).
 * Used only to prove "this is a signed-in Adobe user" — the resulting IMS access
 * token is exchanged for a SpaceCat session token via SpacecatClient.
 */

interface AdobeImsAccessToken {
  token: string;
  expire: number;
  sid?: string;
}

interface AdobeIms {
  initialize: () => void;
  isSignedInUser: () => boolean;
  getAccessToken: () => AdobeImsAccessToken | undefined;
  signIn: () => void;
  signOut: () => void;
}

interface AdobeImsFactory {
  createIMSLib: (config: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    adobeIMS?: AdobeIms;
    adobeImsFactory?: AdobeImsFactory;
  }
}

const IMS_SCRIPT_SRC_BY_ENVIRONMENT: Record<'prod' | 'stage', string> = {
  prod: 'https://auth.services.adobe.com/imslib/imslib.min.js',
  stage: 'https://auth-stg1.services.adobe.com/imslib/imslib.js',
};

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

let readyPromise: Promise<AdobeIms> | null = null;

const initIms = (): Promise<AdobeIms> => {
  if (readyPromise) {
    return readyPromise;
  }

  const clientId = import.meta.env.VITE_IMS_CLIENT_ID;
  const environment = import.meta.env.VITE_IMS_ENVIRONMENT === 'stage' ? 'stage' : 'prod';

  if (!clientId) {
    readyPromise = Promise.reject(new Error('VITE_IMS_CLIENT_ID is not configured'));
    return readyPromise;
  }

  readyPromise = new Promise<AdobeIms>((resolve, reject) => {
    loadScript(IMS_SCRIPT_SRC_BY_ENVIRONMENT[environment])
      .then(() => {
        if (!window.adobeImsFactory) {
          reject(new Error('imslib script loaded but window.adobeImsFactory is missing'));
          return;
        }

        window.adobeImsFactory.createIMSLib({
          client_id: clientId,
          scope: 'openid,AdobeID',
          environment: environment === 'stage' ? 'stg1' : 'prod',
          redirect_uri: window.location.origin,
          useLocalStorage: false,
          onReady: () => resolve(window.adobeIMS as AdobeIms),
          onError: (error: unknown) =>
            reject(error instanceof Error ? error : new Error('IMS initialization failed')),
        });
        window.adobeIMS?.initialize();
      })
      .catch(reject);
  });

  return readyPromise;
};

export const isImsSignedIn = async (): Promise<boolean> => {
  const ims = await initIms();
  return ims.isSignedInUser();
};

export const signInWithIms = async (): Promise<void> => {
  const ims = await initIms();
  ims.signIn();
};

export const signOutOfIms = async (): Promise<void> => {
  const ims = await initIms();
  ims.signOut();
};

export const getImsAccessToken = async (): Promise<string> => {
  const ims = await initIms();

  if (!ims.isSignedInUser()) {
    throw new Error('Not signed in to Adobe');
  }

  const accessToken = ims.getAccessToken();
  if (!accessToken?.token) {
    throw new Error('Signed in but no IMS access token is available');
  }

  return accessToken.token;
};
