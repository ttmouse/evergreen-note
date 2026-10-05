import { ROUTE_KEY } from '../../addons/Router/Router';

const loaded: { [src: string]: Promise<boolean> } = {};

/**
 * Load a script from a URL.
 */
export function loadScript(srcList: string | string[], cache = true) {
  if (typeof srcList === 'string') {
    srcList = [srcList];
  }
  const promises: Promise<boolean>[] = [];
  for (let src of srcList) {
    if (!src.startsWith('http') && !src.startsWith('assets')) {
      src = `/static/assets/${src.replace(/^\//, '')}`;
    }
    if (src.startsWith('addon/')) {
      src = `/static/assets/js/${src}`;
    }
    if (!window.location.href.includes(`/${ROUTE_KEY}/`)) {
      src = src.replace(`/${ROUTE_KEY}`, '');
    }
    if (window.location.hostname === 'localhost' && window.location.port !== '') {
      src = `http://127.0.0.1:${import.meta.env.VITE_NOTEKIT_ASSET_PORT || 11820}/` + src;
    }

    if (src in loaded) {
      promises.push(loaded[src]);
    } else {
      const p = new Promise<boolean>((resolve, reject) => {
        const script = document.createElement('SCRIPT') as HTMLScriptElement;
        script.onload = () => resolve(true);
        script.onerror = () => {
          console.error(src, ' NOT FOUND');
          reject(false);
        };
        document.body.appendChild(script);
        script.src = src;
      });
      promises.push(p);
      if (cache) {
        loaded[src] = p;
      }
    }
  }
  return Promise.all(promises);
}
