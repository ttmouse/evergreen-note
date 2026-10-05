import React from 'react';
import { cls } from '../../styles';

const inputStyle = cls`
  font-size: inherit;
  font-family: inherit;
  color: inherit;
  background: transparent;
  border: none;
  outline: none;
  padding-left: 2px;
  padding-right: 2px;
  opacity: 0.5;
  field-sizing: content;

  &:focus {
    outline: none;
  }
`;

export function AutoGrowInput(props: {
  placeholder: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const { placeholder, onChange, onKeyDown } = props;
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.KeyboardEvent) => {
    onKeyDown?.(e as any);
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || e.key === 'Enter') {
      return;
    }
    if (inputRef.current) {
      const v = inputRef.current.value;
      if (v.length > 0) {
        onChange(v);
      }
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        position: 'relative',
        justifyContent: 'center',
      }}
    >
      <input
        onKeyUp={handleChange}
        className={inputStyle}
        placeholder={placeholder}
        ref={inputRef}
      />
    </span>
  );
}
