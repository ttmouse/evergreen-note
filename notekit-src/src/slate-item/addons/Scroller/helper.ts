import { cls, colorBase } from '../../styles';
import { sleep } from '../../utils/sleep';
import { until } from '../../utils/until';

const transStyle = cls`
  transition: all 3s;
`;

const highlightStyle = cls`
  background-color: ${[colorBase.primary, 300]};
  border-radius: 4px;
`;

export async function scrollToElement(selector: string) {
  const el = await until<HTMLElement>(
    () => document.querySelector(selector) as any
  );
  if ((el as any)?.scrollIntoViewIfNeeded) {
    (el as any)?.scrollIntoViewIfNeeded();
  } else {
    el?.scrollIntoView();
  }
  el?.classList.add(highlightStyle);
  await sleep(100);
  el?.classList.add(transStyle);
  el?.classList.remove(highlightStyle);
  await sleep(2000);
  el?.classList.remove(transStyle);
}
