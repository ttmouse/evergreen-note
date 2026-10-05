import { FormikValues } from 'formik';
import React from 'react';
import { FormElProps } from '../Form';
import { mkid } from '../../../utils/string/mkid';
import InputLabel from '@mui/material/InputLabel';
import FormHelperText from '@mui/material/FormHelperText';
import { cls } from '../../../styles';
import { useAddons } from '../../../hooks/useAddons';
import { Item, ItemNode } from '../../../interfaces/item';
import { EditorProps } from '../../EditorView/EditorView';
import { ContextOnChangeElement } from '../FormContexts';

export type EditorElProps<V extends FormikValues> = FormElProps<V> & {
  EditorProps?: EditorProps;
};

export function EditorElComp(props: EditorElProps<any>) {
  const {
    title,
    value = Item.newItem({
      ori: 'input',
    }),
    quote,
    name = mkid(),
    formik,
    EditorProps: editorProps = {},
  } = props;
  const onChangeElement = React.useContext(ContextOnChangeElement);
  const onChange = (newVal: ItemNode[]) => {
    formik?.setFieldValue(name, newVal[0]);
    onChangeElement?.(name, newVal[0]);
  };
  const $ = useAddons();
  const EditorComponent = React.useMemo(
    () => $.editorView.createComponent(),
    [$.editorView]
  );
  return (
    <div className={cls`margin: 16px 8px`}>
      {!title ? null : <InputLabel htmlFor={name}>{title}</InputLabel>}
      <EditorComponent
        item={value as any}
        onChange={onChange}
        {...editorProps}
        titleVisible={false}
        preventSaving
      />
      {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
    </div>
  );
}
