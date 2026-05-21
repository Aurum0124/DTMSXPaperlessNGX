/**
 * AuthenticatedImage - Fetches images from Paperless-ngx with API token
 * 
 * Prevents the browser's HTTP Basic Auth popup that appears when <img src="">
 * makes unauthenticated requests to Paperless.
 */

import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../../config.js';

function AuthenticatedImage({ src, alt = '', style = {}, onLoad, onError, onLoadStart, ...rest }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) return;

    const abort = new AbortController();
    let urlToRevoke = null;

    onLoadStart?.();
    fetch(src, {
      signal: abort.signal,
      headers: {
        'Authorization': API_CONFIG.HEADERS.Authorization,
      },
      credentials: 'include',
    })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(blob => {
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setObjectUrl(url);
        setError(false);
        setLoading(false);
        onLoad?.();
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(true);
          setLoading(false);
          onError?.();
        }
      });

    return () => {
      abort.abort();
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [src]);

  if (error || !objectUrl) {
    return null;
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      style={{ ...style, display: loading ? 'none' : style.display ?? 'block' }}
      onLoad={onLoad}
      {...rest}
    />
  );
}

export default AuthenticatedImage;
