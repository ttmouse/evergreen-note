export type RGBColor = [number, number, number];
type FloatNumber = number;

export function calcColor(
  rgb1: RGBColor,
  rgb2: RGBColor,
  percent: FloatNumber
) {
  function c(c1: number, c2: number) {
    return c1 + parseInt(String((c2 - c1) * percent), 10);
  }
  const [r1, g1, b1] = rgb1;
  const [r2, g2, b2] = rgb2;
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`;
}
