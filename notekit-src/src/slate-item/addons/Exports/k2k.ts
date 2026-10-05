/* eslint-disable prettier/prettier */
import { flip } from '../../utils/object/flip';

export const k2key = {
  'k': 'ky',
  'ak': 'asky',
  's': 'subitems',
  'l': 'leaves',
  'o': 'ori',
  'tp': 'topic',
  'q': 'quote',
  'c': 'created',
  'u': 'updated',
  'p': 'pky',
  'pa': 'path',
  'cr': 'crumbs',
  'f': 'foldup',
  'm': 'mentions',
  'rt': 'referText',
  'rb': 'referBlock',
  'bt': 'blockType',
  'w': 'weight',
  'i': 'ikys',
  't': 'text'
};

// Flip kToKey
export const key2k = flip(k2key);