import React from 'react';
import { FormElProps } from '../Form';
import InputLabel from '@mui/material/InputLabel';
import { cls, colorBase, preset } from '../../../styles';
import Box from '@mui/material/Box';
import { FormInnerComp } from '../FormComp';
import { ContextFormik } from '../FormContexts';

export function GroupElComp(props: FormElProps<any>) {
  const { title, quote, name, order = 10, subitems } = props;
  const { length } = Object.keys(subitems!);
  const formik = React.useContext(ContextFormik);
  const classList = [
    cls`
      label: form-el-group;
      order: ${order};
      min-width: calc(100% - 16px);
      border: 1px solid var(--cl-slate-300);
      border-radius: 4px;
      display: flex;
      flex-wrap: nowrap;
      justify-content: flex-start;
      align-items: center;
      height: 40px;
      overflow: hidden;

      *, *::before, *::after {
        border-radius: 0 !important;
        border: none !important;
        margin-top: 0px !important;
        margin-bottom: 0px !important;
      }

      > * {
        border-right: 1px solid var(--cl-slate-300); !important;;
        height: 100%;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        flex-basis: ${100 / length}%;

        &:last-child {
          border-right: none !important;
        }
      }
    `,
    'form-fieldset',
    'form-group',
    `form-el-${name}`,
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
