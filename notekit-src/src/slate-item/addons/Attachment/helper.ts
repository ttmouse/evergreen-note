import { isEmpty } from '../../../assets/js/codemirror/src/util/misc';

export function byte2mb(filesize: number) {
  return Math.round(filesize / 1024 / 1024);
}

export function byte2kb(filesize: number) {
  return Math.round(filesize / 1024);
}

export function byteAuto(filesize: number) {
  if (isEmpty(filesize)) {
    return '';
  }
  if (filesize > 1024 * 1024) {
    return `${byte2mb(filesize)}MB`;
  }
  return `${byte2kb(filesize)}KB`;
}
