import React from 'react';
import { FormElProps } from '../Form';
import InputLabel from '@mui/material/InputLabel';
import { cls } from '../../../styles';
import Box from '@mui/material/Box';
import { FormInnerComp } from '../FormComp';
import { ContextFormik } from '../FormContexts';

export function FieldsetElComp(props: FormElProps<any>) {
  const { title, quote, name, order = 10 } = props;
  const formik = React.useContext(ContextFormik);
  const classList = [
    cls`
      order: ${order};
      min-width: calc(100% - 16px);
      & > * { min-width: calc(100% - 16px); }
    `,
    'form-fieldset',
    `form-fieldset-${name}`,
  ];

  return (
    <Box className={classList.join(' ')}>
      <InputLabel
        sx={{
          backgroundColor: '#607d8b21',
          padding: '2px 8px',
          borderRadius: 1,
        }}
      >
        {title}
      </InputLabel>
      <FormInnerComp {...(props as any)} formik={formik as any} />
    </Box>
  );
}
