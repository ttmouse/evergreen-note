export const isDate = (value: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
};

export const isNumber = (value: string): boolean => {
  return /^\d+$/.test(value);
};

export const isPhone = (value: string): boolean => {
  return /^1\d{10}$/.test(value);
};

export const isEmail = (value: string): boolean => {
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    value
  );
};

export const isChinese = (value: string): boolean => {
  return /^[\u4e00-\u9fa5]+$/.test(value);
};

export const isEnglish = (value: string): boolean => {
  return /^[a-zA-Z]+$/.test(value);
};

export const isMarkdownHeading = (value: string): boolean => {
  return /^#{1,6}$/.test(value);
};

export const isMarkdownTable = (value: string): boolean => {
  return /^\|[^\n]+\|$/.test(value);
};

export const isMarkdownList = (value: string): boolean => {
  return /^[*\-+]\s/.test(value);
};

export const isMarkdownCheckbox = (value: string): boolean => {
  return /^\[(x| )\]\s/.test(value);
};

// Escape a string from regexp special characters.
export const escapeRegExp = (s: string): string => {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
};

export const isUrl = (value: string): boolean => {
  return /^[a-z0-9]+?:\/\/\S+$/i.test(value);
};

export const isImgUrl = (value: string): boolean => {
  return /^https?:\/\/.*?\.(?:png|jpg|jpeg|gif|svg|awebp)$/i.test(value);
};

export const isEnSymbol = (value: string): boolean => {
  return /^[\u0020-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]+$/.test(value);
};

export const isCnSymbol = (value: string): boolean => {
  // /[\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]/;
  return /^[\u3000-\u303F\uFF00-\uFFEF]+$/.test(value);
};
