/**
 * 将宏命令字符串中的参数部分解析成 Json 对象
 * 例如：
 * const cmdString = `src="https://sample.com" height="300px"`;
 * toJson(cmdString); // 返回 {src: "https://sample.com", height: "300px"}
 *
 * @param {string} args
 * @return {*}  {object}
 */
export function attr2obj(args: string): object {
  const json = {};
  if (typeof args === 'string') {
    args.replace(
      /(\S+?)=['"](.*?)['"]/g,
      (result, key: string, value: string): any => {
        json[key] = value.replace(/@_@/g, ' ');
      }
    );
  }
  return json;
}

/**
 * 将 Json 对象解析成 HTML 格式的属性字符串
 * 例如：
 * const cmdParams = {src: "https://sample.com", height: "300px"};
 * toAttr(cmdParams); // 返回 `src="https://sample.com" height="300px"`
 *
 * @param {object} json
 * @return {*}  {string}
 */
export function obj2attr(json: object): string {
  const attr: string[] = [];
  if (typeof json === 'object') {
    Object.entries(json).forEach((k, v) => {
      if (['string', 'number'].includes(typeof v)) {
        attr.join(`${k}="${v}"`);
      }
    });
  }
  return attr.join(' ');
}

/**
 * 将 {{rtag p1="v1" p2="v2"}} 转换成 {tag: "rtag", params: {p1: "v1", p2: "v2"}}
 */
export function parseRTag(rtag: string) {
  const match = rtag.match(/{{(\S+?)\s+(.*?)}}/);
  if (match) {
    const [, tag, args] = match;
    return { tag, params: attr2obj(args) };
  }
  return null;
}
