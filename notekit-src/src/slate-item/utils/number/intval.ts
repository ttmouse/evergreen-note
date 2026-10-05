export function intval(v) {
  if (typeof v === 'boolean') {
    return Number(v);
  }
  const num = parseInt(v, 10);
  if (Number.isNaN(num)) {
    return 0;
  }
  return num;
}
