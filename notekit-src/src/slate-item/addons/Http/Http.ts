/* eslint-disable prefer-const */
import { DEBUG_MODE, IS_CLIENT } from '../../../main';
import { IAddon, App, NewAddonParams } from '../../engine/App';
import { ROUTE_KEY } from '../Router/Router';
import { HttpProgressParams, progress } from './helper';

export class Http implements IAddon {
  app!: App;
  config = {};

  _progress(params: HttpProgressParams) {
    let { uri, payload = {} as any, method } = params;

    if (method === 'get') {
      uri = `${uri}&${new URLSearchParams(payload).toString()}`;
      payload = {};
    }

    return progress({
      ...params,
      uri,
      payload,
    });
  }

  progress(params: HttpProgressParams) {
    let { uri, payload = {} as any, method } = params;

    if (method === 'get') {
      uri = `${uri}&${new URLSearchParams(payload).toString()}`;
      payload = {};
    }

    return progress({
      ...params,
      uri,
      payload,
    });
  }

  get(uri: string, payload = {} as any, isJson = true) {
    return this.progress({ uri, payload, isJson, method: 'get' });
  }

  post(uri: string, payload = {} as any, isJson = true, contentType?: string) {
    return this.progress({
      uri,
      payload,
      isJson,
      method: 'post',
      contentType,
    });
  }

  postJson(uri: string, payload = {} as any) {
    return this.post(uri, payload, true, 'application/json');
  }

  addonRun() {}
}

export function createHttpAddon({ app, $ }: NewAddonParams) {
  return { http: new Http() };
}
