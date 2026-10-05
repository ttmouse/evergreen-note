import { App, NewAddonParams , IAddon } from '../../engine/App';
import { Node } from '../../slate.inc';

export function createSlNodeAddon({ app, $ }: NewAddonParams): Node & IAddon {
  return {
    app: {} as App,
    addonRun() {},
    ...Node,
  } as any;
}
