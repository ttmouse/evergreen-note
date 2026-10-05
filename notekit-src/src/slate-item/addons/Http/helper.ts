/* eslint-disable prefer-const */
import { isEmpty } from '../../utils/isEmpty';
import { showSnack } from '../../utils/msg/showSnack';

export type HttpProgressParams = {
  uri: string;
  payload: Object;
  callback?: Function;
  method?: 'post' | 'get';
  showProgress?: boolean;
  isJson?: boolean;
  contentType?: string; // application/json
  headers?: { [key: string]: string };
};

export function progress(params: HttpProgressParams): Promise<any> {
  let {
    uri,
    payload = {} as any,
    callback = () => {},
    method = 'post',
    showProgress = false,
    isJson = true,
    headers = {},
  } = params;

  return new Promise((resolve) => {
    if (!isEmpty(localStorage.apptoken)) {
      payload.apptoken = localStorage.apptoken;
    }

    const formpayload = new FormData();
    for (const k of Object.keys(payload)) {
      formpayload.append(k, payload[k]);
    }

    const xhr = new XMLHttpRequest();
    xhr.open(method, uri);

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          let result = xhr.responseText;
          if (isJson) {
            result = JSON.parse(result);
          }
          callback(result);
          resolve(result);
        } else {
          resolve({
            result: false,
            error: xhr.status == 0 ? -1 : xhr.status,
            msg: 'Request Error',
          });
        }
      }
    };
    xhr.onerror = xhr.onabort = () => {
      resolve({
        result: false,
        error: xhr.status==0 ? -1 : xhr.status,
        msg: 'Network Error',
      });
    };

    if (showProgress) {
      const snack = showSnack({
        content: 'Please wait ...',
        vertical: 'bottom',
        horizontal: 'right',
        autoClose: Infinity,
      });

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = (event.loaded / event.total) * 100;
          snack.progress(percent);
          console.log(`${percent}%`);
        }
      };
    }

    if (!isEmpty(headers)) {
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
      xhr.send(formpayload);
    } else {
      xhr.send(formpayload);
    }
  });
}

// export function get(uri: string, payload = {} as any, isJson = true) {
//   return progress({ uri, payload, isJson, method: 'get' });
// }

// export function post(uri: string, payload = {} as any, isJson = true) {
//   return progress({ uri, payload, isJson, method: 'get' });
// }
