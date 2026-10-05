import React from 'react';

export function AttachmentInputComp(
  props: {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  } & any
) {
  const { onChange, ...rest } = props;
  return (
    <input
      {...rest}
      style={{ display: 'none' }}
      type="file"
      onChange={onChange}
    />
  );
}
