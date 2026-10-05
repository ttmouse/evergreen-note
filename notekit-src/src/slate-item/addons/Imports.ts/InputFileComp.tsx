import React from 'react';
import { utf8decode } from '../../utils/string/utf8';

export type InputFileProps = {
  onLoad: (evt: ProgressEvent<FileReader>, content: string) => void;
  id: string;
};

export function InputFileComp(props: InputFileProps) {
  const { onLoad, ...rest } = props;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const readers: { [i: string]: FileReader } = {};
    const ele = e.target as HTMLInputElement;

    if (ele.files) {
      for (const [i, file] of Object.entries(ele.files)) {
        if (file instanceof File === false) {
          continue;
        }
        readers[i] = new FileReader();
        readers[i].onload = (ev) => {
          const match = /;base64,(.+)/i.exec((ev.target as any).result)!;
          const content = utf8decode(atob(match[1]));
          onLoad && onLoad(ev, content);
        };
        readers[i].readAsDataURL(file);
      }
    }
  };
  return (
    <input
      {...rest}
      style={{ display: 'none' }}
      type="file"
      accept="text/*"
      onChange={onChange}
    />
  );
}
