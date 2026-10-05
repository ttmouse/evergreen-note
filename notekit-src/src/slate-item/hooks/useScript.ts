import { useAwait } from './useAwait';
import { loadScript } from '../utils/dom/loadScript';

export function useScript(src: string | string[], callback: Function) {
  useAwait(async () => {
    await loadScript(src);
    callback();
  }, []);
}
