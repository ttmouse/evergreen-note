// import Cookies from "js-cookie";
// import { isEmpty } from "../isEmpty";
import { upperCaseFirst } from '../string';

export type KYS_ROOT = 'app';
export type KYS_UNKNOWN = 'app';

export const KYS = {
  ROOT: 'app',
  UNKNOWN: '-',
} as const;

export type ValueOf<T> = T[keyof T];
export type KYS = ValueOf<typeof KYS>;

let NUM64_ID = 1;
export function num64(number?: number): string {
  if (typeof number !== 'number') {
    const id = num64(Date.now()) + num64(NUM64_ID);
    NUM64_ID++;
    return id;
  }

  const chars: string[] =
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const radix = chars.length;
  let qutient = +number;
  const arr: string[] = [];
  do {
    const mod = qutient % radix;
    qutient = (qutient - mod) / radix;
    arr.unshift(chars[mod]);
  } while (qutient);
  return arr.join('');
}

export function nanoid(t = 11) {
  // Speed: 1000000 IDs per hour
  // ~71 years needed, in order to have a 1% probability of at least one collision.

  let e = '';
  const r = crypto.getRandomValues(new Uint8Array(t));
  for (; t--; ) {
    const n = 63 & r[t];
    if (n < 36) {
      e += n.toString(36);
    } else if (n < 62) {
      e += (n - 26).toString(36).toUpperCase();
    } else if (n < 63) {
      e += '_';
    } else {
      e += '-';
    }
  }
  return e;
}

export function mkid(
  props: { prefix: string; suffix?: string; id?: string | null } = {
    prefix: '',
    suffix: '',
    id: null,
  }
): string {
  const { prefix = '', suffix = '', id } = props;
  return `i${prefix}${id ?? nanoid()}${suffix}`;
}

export function addonId(addonKey: string): string {
  return `App${upperCaseFirst(addonKey)}`;
}

export function userMkid(userId: number, key = mkid()): string {
  return `u${num64(userId)}-${key}`;
}

export function isValidKy(val: any) {
  if (typeof val === 'string' && val.length > 0) {
    return /^[a-z0-9_-]+$/i.test(val);
  }
  return false;
}
