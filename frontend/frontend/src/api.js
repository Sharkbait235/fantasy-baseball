const REMOTE_API_BASE = 'https://fantasy-baseball-o8ta.onrender.com/api';
const LOCAL_API_PORT = '3001';

function getConfiguredApiBase() {
  const configured = process.env.REACT_APP_API_BASE;
  return configured && typeof configured === 'string' ? configured.trim() : '';
}

function isLocalOrPrivateHost(hostname) {
  if (!hostname) return false;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return true;
  }

  if (hostname.endsWith('.local')) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;

  const match172 = hostname.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const octet = Number(match172[1]);
    if (octet >= 16 && octet <= 31) return true;
  }

  return false;
}

function getLocalApiBase() {
  const configuredBase = getConfiguredApiBase();
  if (configuredBase) {
    return configuredBase;
  }

  if (typeof window === 'undefined') {
    return REMOTE_API_BASE;
  }

  const hostname = window.location.hostname || 'localhost';

  // Keep production and any HTTPS host on the secure remote API to avoid mixed-content blocks.
  if (!isLocalOrPrivateHost(hostname) || window.location.protocol === 'https:') {
    return REMOTE_API_BASE;
  }

  return `http://${hostname}:${LOCAL_API_PORT}/api`;
}

function rewriteApiUrl(url) {
  if (typeof url !== 'string') return url;
  if (!url.startsWith(REMOTE_API_BASE)) return url;
  return `${getLocalApiBase()}${url.slice(REMOTE_API_BASE.length)}`;
}

export function installLocalApiRewrite() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  if (window.__baseballLocalApiRewriteInstalled) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    if (typeof input === 'string') {
      return originalFetch(rewriteApiUrl(input), init);
    }

    if (input instanceof Request) {
      const rewrittenUrl = rewriteApiUrl(input.url);
      if (rewrittenUrl !== input.url) {
        return originalFetch(new Request(rewrittenUrl, input), init);
      }
    }

    return originalFetch(input, init);
  };

  window.__baseballLocalApiRewriteInstalled = true;
}
