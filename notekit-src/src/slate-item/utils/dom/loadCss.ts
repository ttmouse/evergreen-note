import { ROUTE_KEY } from '../../addons/Router/Router';

/**
 * Load a CSS file from a URL.
 * @param src
 * @returns
 */

const loaded: { [src: string]: Promise<boolean> } = {};

export function loadCss(src: string) {
  if (!src.startsWith('http') && !src.startsWith('assets')) {
    src = `/static/assets/${src.replace(/^\//, '')}`;
  }
  if (window.location.hostname === 'localhost' && window.location.port !== '') {
    src = `http://127.0.0.1:${import.meta.env.VITE_NOTEKIT_ASSET_PORT || 11820}/` + src;
  }
  if (src in loaded === false) {
    loaded[src] = new Promise((resolve, reject) => {
      const link = document.createElement('LINK') as HTMLLinkElement;
      link.rel = 'stylesheet';
      link.href = src;
      document.head.appendChild(link);
      link.onload = () => resolve(true);
      link.onerror = () => reject(false);
    });
  }
  return loaded[src];
}
