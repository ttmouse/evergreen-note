import { cls } from '../../styles';

const selectNode = cls`
  user-select: none !important;

  * {
    user-select: none !important;
  }
`;

export function selectNone(preventSelect = true) {
  if (preventSelect) {
    document.body.classList.add(selectNode);
  } else {
    // document.body.classList.remove(selectNode);
  }
}
