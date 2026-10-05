import { Node } from '../../slate.inc';
import { trim } from './trim';

export function nodeString(node: Node) {
  return trim(Node.string(node));
}
