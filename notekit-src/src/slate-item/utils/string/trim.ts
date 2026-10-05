import { ZERO_WIDTH_SPACE } from '../../addons/Strmap/Strmap';

export function trim(str: string): string {
  return str?.trim().replaceAll(ZERO_WIDTH_SPACE, '') ?? '';
}

export function cleanString(str: string): string {
  return str?.replaceAll(ZERO_WIDTH_SPACE, '') ?? '';
}