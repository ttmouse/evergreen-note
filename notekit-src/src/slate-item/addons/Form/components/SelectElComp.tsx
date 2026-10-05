import React from 'react';
import NativeSelect from '@mui/material/NativeSelect';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Box from '@mui/material/Box';
import { cls } from '../../../styles';
import { FormElProps, Options } from '../Form';
import { getOptions } from '../helper';
import { FormikValues } from 'formik';
import FormHelperText from '@mui/material/FormHelperText';
import { ContextOnChangeElement } from '../FormContexts';

export type SelectElProps<V extends FormikValues> = FormElProps<V> & {
  options: Options;
  name: string;
};

export function SelectElComp<V extends FormikValues>(props: SelectElProps<V>) {
  const { value, title, options, name, onElChange, quote, order = 10 } = props;
  const onChangeElement = React.useContext(ContextOnChangeElement);
  const handleChange = (e: any) => {
    onElChange?.(e, e.target.value);
    onChangeElement?.(name, e.target.value);
  };

  return (
    <Box
      className={[
        cls`
          order: ${order};
          width: 100% !important;
          &:not(.form-group *) {
            padding-right: 16px;
          }
        `,
        `form-el-${name}`,
      ].join(' ')}
    >
      <FormControl fullWidth>
        <InputLabel variant="standard" htmlFor={`uncontrolled-native${name}`}>
          {title}
        </InputLabel>
        <NativeSelect
          className={cls`margin: 8px 0px;`}
          name={name}
          value={value}
          onChange={handleChange as any}
          inputProps={{
            name,
            id: `uncontrolled-native${name}`,
          }}
        >
          {Object.entries(getOptions(options)).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
        {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
      </FormControl>
    </Box>
  );
}
