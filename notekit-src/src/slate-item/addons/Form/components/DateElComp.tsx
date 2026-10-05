import { FormikValues } from 'formik';
import React from 'react';
import { FormElProps } from '../Form';
import { useChange } from '../helper';
import { Dayjs } from 'dayjs';
import TextField from '@mui/material/TextField';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { omit } from '../../../utils/object/omit';
import { datekit, YYYY_MM_DD } from '../../../utils/date/datekit';
import { CustomElComp } from './CustomElComp';

export type DateElProps<V extends FormikValues> = FormElProps<V> & {};

export const DateElComp = (props: FormElProps<any>) => {
  const { value } = props;
  const [val, setVal] = React.useState<Dayjs | null>(
    value ? datekit(value as YYYY_MM_DD) : null
  );
  const onChange = useChange(props);
  const { title } = props;

  return (
    <CustomElComp {...omit(props, ['title'])}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DatePicker
          label={title}
          value={val}
          onChange={(newValue) => {
            setVal(newValue);
            onChange(null, newValue?.format(YYYY_MM_DD) ?? '');
          }}
          renderInput={(params) => <TextField {...params} />}
          inputFormat={YYYY_MM_DD}
        />
      </LocalizationProvider>
    </CustomElComp>
  );
};
