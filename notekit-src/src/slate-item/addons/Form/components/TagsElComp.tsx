import React from 'react';
import Box from '@mui/material/Box';
import { FormikValues } from 'formik';
import { ContextOnChangeElement } from '../FormContexts';
import Chip from '@mui/material/Chip';
import { cls, colorBase } from '../../../styles';
import InputLabel from '@mui/material/InputLabel';
import FormHelperText from '@mui/material/FormHelperText';
import { FormElProps } from '../Form';

const boxStyle = cls`
  border-radius: 4px;
  outline: 1px solid ${[colorBase.grey, 200]};
  padding: 10px 4px 8px 4px;
  cursor: text;

  &.active {
    outline: 2px solid ${[colorBase.primary, 700]};
  }
`;

const chipStyle = cls`
  margin: 2px !important;
`;

const inputStyle = cls`
  background-color: transparent;
  border: none;
  min-width: 100px;

  &:focus {
    outline: none;
    border: none;
  }
`;

function TagsInput(props: {
  value?: string[];
  onChange?: (value: string[]) => void;
}) {
  const { value = [], onChange } = props;
  const [active, setActive] = React.useState(false);
  const [tags, setTags] = React.useState(value);
  const change = (nextTags: string[]) => {
    setTags(nextTags);
    onChange?.(nextTags);
  };

  const handleKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (e.key === 'Enter' && v) {
      change([...tags.filter((t) => t !== v), v]);
      e.currentTarget.value = '';
    }
    if (['Backspace', 'Delete'].includes(e.key) && !v) {
      change(tags.slice(0, -1));
    }
  };

  const ref = React.useRef<HTMLInputElement>(null);

  // Click the tag to remove it
  const handleDelete = (tag: string) => {
    change(tags.filter((t) => t !== tag));
    ref.current?.focus();
  };

  const classList = [boxStyle, 'tags-box'];
  if (active) {
    classList.push('active');
  }

  const handleBlur = (e: any) => {
    e.currentTarget.value = '';
    setActive(false);
  };

  const handleClickBox = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).matches('.tags-box')) {
      setActive(true);
      ref.current?.focus();
    }
  };

  return (
    <div className={classList.join(' ')} onClick={handleClickBox}>
      {Object.values(tags).map((tag) => (
        <Chip
          onDelete={() => handleDelete(tag)}
          className={chipStyle}
          size="small"
          label={tag}
        />
      ))}
      <input
        ref={ref}
        onBlur={handleBlur}
        onKeyDown={handleKeydown}
        className={inputStyle}
        onFocus={() => setActive(true)}
      />
    </div>
  );
}

const labelStyle = cls`
  display: inline-block !important;
  padding: 0px 4px !important;
  background-color: var(--body-bg-color);
  margin-bottom: 6px;
  margin-left: 8px;
  font-size: 12px !important;
`;

export function TagsElComp<V extends FormikValues>(props: FormElProps<V>) {
  const { title, quote, value = [], name, onElChange, formik } = props;
  const theValue = Array.isArray(value) ? value : [value];
  const [val, setVal] = React.useState(theValue);
  const onChangeElement = React.useContext(ContextOnChangeElement);
  const onChange = (newVal: string[]) => {
    setVal(newVal);
    formik?.setFieldValue(name!, newVal);
    onElChange?.(null as any, newVal);
    onChangeElement?.(name!, newVal);
  };

  return (
    <Box>
      <InputLabel
        size="small"
        className={labelStyle}
        variant="standard"
        htmlFor="uncontrolled-native"
      >
        {title}
      </InputLabel>
      <TagsInput onChange={onChange} value={val} />
      {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
    </Box>
  );
}
