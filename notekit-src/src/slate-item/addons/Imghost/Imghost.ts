/* eslint-disable no-async-promise-executor */
import { IAddon, App, NewAddonParams } from '../../engine/App';
// import OSS from 'ali-oss';
import { cover } from '../../engine/helper';
import { dataURLToBlob } from './helper';
import { Base64ImageDbAdminnse } from '../Img/Img';
import dayjs from 'dayjs';
import { AttachmentResponse } from '../Attachment/Attachment';
import { HttpProgressParams } from '../Http/helper';
import { trim } from '../../utils/string/trim';
import { showSnack } from '../../utils/msg/showSnack';
import { loadScript } from '../../utils/dom/loadScript';
import { $t } from '../../../i18n';
import { isEmpty } from '../../utils/isEmpty';

export type UploadResult = { path: string };
export interface ImghostInterface {
  uploadDataURL: (params: {
    data: string;
    filename?: string;
  }) => Promise<UploadResult>;
}

type OSS = any;

declare global {
  interface AppConf {
    imghostName: string;
    aliOssBucket?: string;
    aliOssRegion?: string;
    aliOssAccessKeyId?: string;
    aliOssAccessKeySecret?: string;
  }
}

export function createImghostAddon(params: NewAddonParams) {
  const { app, $ } = params;

  const isAlioss = () => app.cfg.imghostName === 'alioss';

  class Imghost implements IAddon {
    app!: App;

    config = {
      imghostName: '',
      aliOssBucket: '',
      aliOssRegion: '',
      aliOssAccessKeyId: '',
      aliOssAccessKeySecret: '',
    };

    alioss!: OSS;

    addonInfo() {
      return {
        title: $t`imghost.title`,
        type: 'fieldset',
        defaultValue: 'off',
        quote: $t`imghost.quote`,
        subitems: {
          imghostName: {
            title: $t`imghost.host_name`,
            type: 'select',
            options: {
              evergreen: `Evergreen Note`,
              alioss: `AliOSS`,
            },
          },
          aliOssBucket: {
            title: `AliOSS Bucket`,
            type: 'text',
            when: { imghostName: 'alioss' },
          },
          aliOssRegion: {
            title: `AliOSS Region`,
            type: 'text',
            when: { imghostName: 'alioss' },
          },
          aliOssAccessKeyId: {
            title: `AliOSS Access Key ID`,
            type: 'text',
            when: { imghostName: 'alioss' },
          },
          aliOssAccessKeySecret: {
            title: `AliOSS Access Key Secret`,
            type: 'text',
            when: { imghostName: 'alioss' },
          },
          aliOssNotice: {
            // title: `Notice`,
            type: 'alert',
            quote: $t`imghost.alioss_alert`,
            when: (values: any) =>
              values.imghostName === 'alioss' &&
              isEmpty(values.aliOssAccessKeySecret),
          },
        },
      };
    }

    async initAlioss() {
      if (app.cfg.imghostName === 'alioss') {
        await loadScript('js/alioss.min.js');
        try {
          const { OSS } = window as any;
          $.imghost.alioss = new OSS({
            bucket: app.cfg.aliOssBucket,
            region: app.cfg.aliOssRegion,
            accessKeyId: app.cfg.aliOssAccessKeyId,
            accessKeySecret: app.cfg.aliOssAccessKeySecret,
          });
        } catch (e: any) {
          console.error(e);
          showSnack({
            content: `AliOSS error: ${e.message}`,
            severity: 'error',
            autoClose: 100000,
          });
        }
      }
    }

    /**
     * 处理图片上传
     * @param dataURL
     * @param filename
     * @returns
     */
    uploadDataURL(dataURL: string, filename = ''): Promise<Base64ImageDbAdminnse> {
      filename = trim(filename);
      if (isEmpty(filename)) {
        filename = `${dayjs().format('YYYYMMDDHHmmss')}`;
      }

      const storeAs = `evergreen/${filename}.png`;
      const type = 'image/png';
      return new Promise(async (resolve) => {
        const data = dataURLToBlob(dataURL, type);
        $.imghost.alioss
          .multipartUpload(storeAs, data)
          .then((result: any) => {
            const url = result.res.requestUrls[0];
            const fileUrl = url.replace(/\?.+/g, '');
            resolve({
              path: fileUrl,
              result: true,
            });
          })
          .catch((err: any) => {
            console.error(err);
            resolve({ path: '', result: false });
          });
      });
    }

    /**
     * 处理普通文件上传
     * @param infos
     * @returns
     */
    handleUpload(infos: HttpProgressParams) {
      const file = Object.values(infos.payload)[0];
      const [name, suffix] = file.name.split('.');
      const d = dayjs().format('yyyyMMddhhmmss');
      const storeAs = `evergreen/${d}.${suffix}`;
      return $.imghost.alioss
        .multipartUpload(storeAs, file)
        .then((response: any) => {
          const result: AttachmentResponse = {
            result: true,
            msg: $t(`success_msg`, { filename: response.name }),
            content: '',
            info: {
              name: response.name,
              ext: suffix,
              path: response.res.requestUrls[0].replace(/\?.+/g, ''),
              type: file.type,
            },
          };
          infos.callback?.(result);
        });
    }

    addonRun() {
      $.imghost.initAlioss();

      // const { uploadDataURL } = $.img;
      // cover(uploadDataURL, (dataURL, filename) => {
      //   if (isAlioss()) {
      //     showSnack(`Uploading file to ${app.cfg.imghost_hostname}`);
      //     return $.imghost.uploadDataURL(dataURL, filename);
      //   }
      //   return uploadDataURL.call($.img, dataURL, filename);
      // });

      const { progress } = $.http;
      cover(progress, (infos) => {
        if (isAlioss()) {
          if (infos.uri === 'plugin/outline/handle-upload') {
            return $.imghost.handleUpload(infos);
          }
          if (infos.uri === 'plugin/base64-image/save') {
            const { uri, filename } = infos.payload as any;
            return $.imghost.uploadDataURL(uri, filename);
          }
        }
        return progress.call($.http, infos);
      });
    }
  }

  return { imghost: new Imghost() };
}
