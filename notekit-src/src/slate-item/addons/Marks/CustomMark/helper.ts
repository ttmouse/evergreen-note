import { cls } from '../../../styles/atom';
import { CustomMarkType } from './CustomMark';

export function generateStyle(
  type: CustomMarkType,
  style: string | { value: string }
) {
  const value = typeof style === 'string' ? style : style.value;
  return cls`
    label: custom-format-${type};
    .mark-format[data-mark-format='${type}'] {
      ${value}
    }
  `;
}

export function generateAllStyles(
  styles: {
    [type in CustomMarkType]: string | { value: string };
  }
) {
  return Object.entries(styles).map(([type, style]) =>
    generateStyle(type as CustomMarkType, style)
  );
}
