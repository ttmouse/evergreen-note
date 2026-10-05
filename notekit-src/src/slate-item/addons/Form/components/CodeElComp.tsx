import { FormikValues } from 'formik';
import React from 'react';
import { FormElProps } from '../Form';
import { CodeblockComp } from '../../Codeblock/CodeblockComp';
import { CodeblockProps } from '../../Codeblock/CodeblockProps';
import { mkid } from '../../../utils/string/mkid';
import InputLabel from '@mui/material/InputLabel';
import FormHelperText from '@mui/material/FormHelperText';
import { cls } from '../../../styles';
import { ContextOnChangeElement } from '../FormContexts';

export type CodeElProps<V extends FormikValues> = FormElProps<V> &
  CodeblockProps;

export function CodeElComp(props: CodeElProps<any>) {
  const {
    title,
    mode,
    value,
    quote,
    name = mkid(),
    onElChange,
    formik,
    autoFocus,
  } = props;
  const [val, setVal] = React.useState(value);
  const onChangeElement = React.useContext(ContextOnChangeElement);
  const onChange = (e: any, newVal: string) => {
    setVal(newVal);
    formik?.setFieldValue(name, newVal);
    onElChange?.(e, newVal);
    onChangeElement?.(name, newVal);
  };
  return (
    <div className={cls`margin: 16px 8px`}>
      {!title ? null : <InputLabel htmlFor={name}>{title}</InputLabel>}
      <CodeblockComp
        autofocus={autoFocus}
        mode={mode}
        value={value}
        onChange={onChange}
        lineNumbers={true}
      />
      {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
    </div>
  );
}
