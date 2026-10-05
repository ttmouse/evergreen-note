import { App, NewAddonParams , IAddon } from '../../engine/App';
import { Element } from '../../slate.inc';

export function createSlElementAddon({ app, $ }: NewAddonParams): IAddon & Element {
  return {
    app: {} as App,
    addonRun() {},
    ...Element,
  } as any;
}
