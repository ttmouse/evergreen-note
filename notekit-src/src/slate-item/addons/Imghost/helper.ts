/**
 * 将以base64的图片url数据转换为Blob
 * @param urlData 图片base64数据
 */
export function dataURLToBlob(urlData: string, type: string) {
  const bytes = window.atob(urlData.split(',')[1]); // 去掉url的头，并转换为byte
  // 处理异常,将ascii码小于0的转换为大于0
  const ab = new ArrayBuffer(bytes.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) {
    ia[i] = bytes.charCodeAt(i);
  }
  return new Blob([ab], { type });
}

/**
 * 将以base64的图片url数据转换为file
 * @param dataurl 图片base64数据
 * @param filename 图片名称
 */
export function dataURLtoFile(dataurl: string, filename: string) {
  // 将base64转换为文件
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {
    type: mime,
  });
}

export const mimeMaps = {
  '3gpp': 'audio/3gpp, video/3gpp',
  ac3: 'audio/ac3',
  asf: 'allpication/vnd.ms-asf',
  au: 'audio/basic',
  css: 'text/css',
  csv: 'text/csv',
  doc: 'application/msword',
  dot: 'application/msword',
  dtd: 'application/xml-dtd',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  jp2: 'image/jp2',
  jpe: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript, application/javascript',
  json: 'application/json',
  mp2: 'audio/mpeg, video/mpeg',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4, video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  mpp: 'application/vnd.ms-project',
  ogg: 'application/ogg, audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  pot: 'application/vnd.ms-powerpoint',
  pps: 'application/vnd.ms-powerpoint',
  ppt: 'application/vnd.ms-powerpoint',
  rtf: 'application/rtf, text/rtf',
  svf: 'image/vnd.svf',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain',
  md: 'text/markdown',
  wdb: 'application/vnd.ms-works',
  wps: 'application/vnd.ms-works',
  xhtml: 'application/xhtml+xml',
  xlc: 'application/vnd.ms-excel',
  xlm: 'application/vnd.ms-excel',
  xls: 'application/vnd.ms-excel',
  xlt: 'application/vnd.ms-excel',
  xlw: 'application/vnd.ms-excel',
  xml: 'text/xml, application/xml',
  zip: 'aplication/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export type MimeType = keyof typeof mimeMaps;

export function mimeAccept(...types: MimeType[]) {
  return types.map((type) => mimeMaps[type]).join(',');
}
