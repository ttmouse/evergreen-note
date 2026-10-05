/* eslint-disable no-console */
import { TimeMilliSecond } from '../interfaces/unit';

/**
 * Execute the callback when the condition is true
 * @param cond Condition function
 * @param wait
 * @param interval
 * @returns
 */
export function until<T>(
  cond: () => T,
  wait: TimeMilliSecond = 30000,
  interval: TimeMilliSecond = 50
): Promise<T> {
  console.assert(typeof cond === 'function', 'until: cond must be a function');
  console.assert(typeof wait === 'number', 'until: wait must be a number');
  console.assert(
    typeof interval === 'number',
    'until: interval must be a number'
  );

  if (wait === -1) {
    wait = Infinity;
  }

  return new Promise((resolve, reject) => {
    let usedTime = 0;
    const t = setInterval(() => {
      const result = cond();
      if (result) {
        clearInterval(t);
        resolve(result);
      } else {
        usedTime += interval;
        if (usedTime > wait) {
          clearInterval(t);
          reject(false);
        }
      }
    }, interval);
  });
}
