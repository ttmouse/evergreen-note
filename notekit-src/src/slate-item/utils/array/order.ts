export function order(items: any[]) {
  items.sort((a, b) => {
    a.order ??= 0;
    b.order ??= 0;
    return a.order - b.order;
  });
  return items;
}
