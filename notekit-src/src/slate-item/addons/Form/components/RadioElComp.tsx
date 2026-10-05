/* eslint-disable prefer-const */
import React from 'react';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import { FormElProps, Options } from '../Form';
import { getOptions } from '../helper';
import { ContextOnChangeElement } from '../FormContexts';
import { cls } from '../../../styles';
import { useOptions } from '../useOptions';

export type RadioElProps<V extends Object> = FormElProps<V> & {
  options: Options;
  name: string;
};

export function RadioElComp<V extends Object>(props: RadioElProps<V>) {
  const {
    value,
    canMore,
    title,
    options: opts,
    formik,
    name,
    onElChange,
  } = props;
  const onChangeElement = React.useContext(ContextOnChangeElement);

  const {
    value: val,
    setVal,
    options,
    onChange,
  } = useOptions({ options: opts, formik, name, value, canMore });

  const handleChange = (e: any, v: any) => {
    onElChange?.(e, v);
    onChangeElement?.(name, v);
    onChange(e, v);
    setVal(v);
  };

  const id = `${name}-radio-buttons-group-label`;

  return (
    <FormControl>
      <FormLabel id={id}>{title}</FormLabel>
      <RadioGroup
        aria-labelledby={id}
        name={name}
        value={val}
        onChange={handleChange}
      >
        {Object.entries(getOptions(options)).map(([v, label]) => (
          <FormControlLabel label={label} value={v} control={<Radio />} />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
