import { createTmpDom } from './dom/createTmpDom';
import { reactRender } from './common';

export function fleetRender(jsxEle: JSX.Element) {
  reactRender(createTmpDom(), jsxEle);
}
