import { isEmpty } from '../utils/isEmpty';

// 一个有着 weight 属性的对象
interface ItemInterface {
  // weight 用于控制排序权重，决定排名先后
  weight: number;
}

export type Items = ItemInterface[];

export function calcOrder(list: Items, index: number): number {
  // 如果 index 是负数，则从列表末尾开始计算
  if (index < 0) {
    index = list.length + index + 1;
  }
  if (list.length < 1) {
    return 5000;
  }
  // 在列表的最开始插入
  if (index === 0) {
    return list[0].weight / 2;
  }
  // 在列表的最末尾插入
  if (index >= list.length) {
    return list[list.length - 1].weight + 5000;
  }
  // 在列表的中间插入
  return (list[index - 1].weight + list[index].weight) / 2;
}

export function shouldReIndex(list: Items): boolean {
  let lastWeight = -1;
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (
      isEmpty(Number(item.weight)) ||
      typeof item.weight !== 'number' ||
      item.weight <= lastWeight
    ) {
      return true;
    }
    lastWeight = item.weight;
  }
  return false;
}

export function reIndex(list: Items): Items {
  let weight = 5000;
  return list.map((item) => {
    const r = { ...item, weight };
    weight += 1000;
    return r;
  });
}
