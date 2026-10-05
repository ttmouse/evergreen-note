import React from 'react';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Box from '@mui/material/Box';
import { FormElProps } from '../Form';
import Button from '@mui/material/Button';
import { FormikValues } from 'formik';
import { mkid } from '../../../utils/string/mkid';
import { ContextOnChangeElement } from '../FormContexts';

export type FileElProps<V extends FormikValues> = FormElProps<V> & {
  onLoad?: (
    loadEvt: any,
    changeEvt: React.ChangeEvent<HTMLInputElement>
  ) => void;
};

export function FileElComp<V extends FormikValues>(props: FileElProps<V>) {
  const {
    title = 'Upload file',
    name = mkid(),
    onElChange,
    onLoad,
    formik,
    accept = '*',
  } = props;
  const onChangeElement = React.useContext(ContextOnChangeElement);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files) {
      for (const file of e.currentTarget.files) {
        if (file instanceof File === false) {
          continue;
        }
        const reader = new FileReader();
        reader.onload = (loadEvt) => {
          const v = loadEvt.target?.result;
          formik?.setFieldValue(name, v);
          onLoad?.(loadEvt, e);
          onElChange?.(e, v);
          onChangeElement?.(name, v);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const fieldName = `file-${name}`;

  return (
    <Box className="FileEl">
      <FormControl fullWidth>
        <Button variant="contained" component="label">
          {title}
          <input accept={accept} name={fieldName} onChange={onChange} type="file" hidden />
        </Button>
      </FormControl>
    </Box>
  );
}
