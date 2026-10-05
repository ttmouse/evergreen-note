import React from 'react';
import Button from '@mui/material/Button';
import InputLabel from '@mui/material/InputLabel';
import Box from '@mui/material/Box';
import { cls } from '../../../styles';
import { FormElProps, Options } from '../Form';
import { FormikValues } from 'formik';
import FormHelperText from '@mui/material/FormHelperText';
import { mkid } from '../../../utils/string/mkid';

export type SelectElProps<V extends FormikValues> = FormElProps<V> & {
  options: Options;
  name: string;
};

const boxStyle = cls`
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-end;
`;

export function ButtonElComp<V extends FormikValues>(props: FormElProps<V>) {
  const { title, onClick, name = mkid(), quote, order = 10, others } = props;
  // const onChangeElement = React.useContext(ContextOnChangeElement);
  // const handleChange = (e: any) => {
  //   onElChange?.(e, e.target.value);
  //   onChangeElement?.(name, e.target.value);
  // };

  return (
    <Box className={boxStyle} style={{ order }}>
      <div className={cls`flex-grow: 1`}>
        <InputLabel variant="standard" htmlFor={`uncontrolled-native${name}`}>
          {title}
        </InputLabel>
        {!quote ? null : <FormHelperText>{quote}</FormHelperText>}
      </div>
      <Button
        className={cls`flex-grow: 0; max-height: 32px;`}
        variant="outlined"
        size="small"
        onClick={(e) => onClick?.(e)}
      >
        {others?.btnText}
      </Button>
    </Box>
  );
}
