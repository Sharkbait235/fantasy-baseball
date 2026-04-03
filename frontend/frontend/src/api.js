const REMOTE_API_BASE = 'https://fantasy-baseball-o8ta.onrender.com/api';

function getLocalApiBase() {
  if (typeof window === 'undefined') {
    return REMOTE_API_BASE;
  }

  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3001/api`;
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
