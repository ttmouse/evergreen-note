export function utf8encode(str: string): string {
  let rs = '';
  for (const i of str) {
    const code = i.codePointAt(0)!;
    if (code < 128) {
      rs += i;
    } else if (code > 127 && code < 2048) {
      rs += String.fromCharCode((code >> 6) | 192, (code & 63) | 128);
    } else if (code > 2047 && code < 65536) {
      rs += String.fromCharCode(
        (code >> 12) | 224,
        ((code >> 6) & 63) | 128,
        (code & 63) | 128
      );
    } else if (code > 65536 && code < 1114112) {
      rs += String.fromCharCode(
        (code >> 18) | 240,
        ((code >> 12) & 63) | 128,
        ((code >> 6) & 63) | 128,
        (code & 63) | 128
      );
    }
  }
  return rs;
}

export function utf8decode(str: string) {
  let rs = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)!;
    if ((240 & code) === 240) {
      const code1 = str.charCodeAt(i + 1);
      const code2 = str.charCodeAt(i + 2);
      const code3 = str.charCodeAt(i + 3);
      rs += String.fromCodePoint(
        ((code & 7) << 18) |
          ((code1 & 63) << 12) |
          ((code2 & 63) << 6) |
          (code3 & 63)
      );
      i += 3;
    } else if ((224 & code) === 224) {
      const code1 = str.charCodeAt(i + 1);
      const code2 = str.charCodeAt(i + 2);
      rs += String.fromCodePoint(
        ((code & 15) << 12) | ((code1 & 63) << 6) | (code2 & 63)
      );
      i += 2;
    } else if ((192 & code) === 192) {
      const code1 = str.charCodeAt(i + 1);
      rs += String.fromCodePoint(((code & 31) << 6) | (code1 & 63));
      i++;
    } else if ((128 & code) === 0) {
      rs += String.fromCharCode(code);
    }
  }
  return rs;
}
