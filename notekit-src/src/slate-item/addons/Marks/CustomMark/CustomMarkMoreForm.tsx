import React from 'react';
import { Formik, Field, Form, ErrorMessage, FieldArray } from 'formik';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { CustomFormatStyle } from './CustomMark';
import { $t } from '../../../../i18n';
import InputLabel from '@mui/material/InputLabel';
import { cls } from '../../../styles';
import { CodeblockComp } from '../../Codeblock/CodeblockComp';
import FormHelperText from '@mui/material/FormHelperText';
import { isEmpty } from '../../../utils/isEmpty';
import Link from '@mui/material/Link';
import { Tip } from '../../../components/Tip/Tip';
import Divider from '@mui/material/Divider/Divider';

export const PUB_KEY_CUSTOM_FORMAT = 'customFormatStyles';

const inputStyle = cls`
  display: block;
  padding: 8px;
  border: 1px solid var(--cl-slate-300);
  border-radius: 4px;
  width: 100%;
  margin-bottom: 8px;
  margin-top: 4px;
`;

const placehoder = `color:inherit;
span {
  color: inherit;
}`;

export const CustomFormatForm = (props: {
  onSubmit: (values: { customMarkFormatStyles: CustomFormatStyle[] }) => void;
  initialValues?: {
    customMarkFormatStyles: CustomFormatStyle[];
  };
}) => {
  const {
    onSubmit,
    initialValues = {
      customMarkFormatStyles: [
        {
          name: '',
          style: '',
          trigger: '',
        },
      ],
    },
  } = props;

  return (
    <div>
      <Formik
        initialValues={initialValues}
        onSubmit={async (values) => {
          if (!Array.isArray(values?.customMarkFormatStyles)) {
            return;
          }
          onSubmit(values);
        }}
      >
        {({ values, setFieldValue }) => (
          <Form>
            <FieldArray name="customMarkFormatStyles">
              {({ insert, remove, push }) => {
                return (
                  <div>
                    {Array.isArray(values.customMarkFormatStyles) &&
                      values.customMarkFormatStyles.map((info, index) => (
                        <div className="row" key={index}>
                          <Box
                            sx={{
                              mb: 2,
                              position: 'relative',
                              '&:hover a': { opacity: 1 },
                            }}
                          >
                            <Tip title={$t`common.delete`}>
                              <Link
                                className={cls`opacity: 0; position: absolute; top: 5px; right: 5px; z-index: 10000`}
                                href="#"
                                onClick={() => remove(index)}
                              >
                                x
                              </Link>
                            </Tip>
                            <InputLabel
                              htmlFor={`customMarkFormatStyles.${index}.name`}
                            >
                              {$t`customMark.format_name`}
                            </InputLabel>
                            <Field
                              name={`customMarkFormatStyles.${index}.name`}
                              type="text"
                              className={inputStyle}
                            />
                            <ErrorMessage
                              name={`customMarkFormatStyles.${index}.name`}
                              component="div"
                              className="field-error"
                            />
                          </Box>

                          <Box sx={{ mb: 1 }}>
                            <InputLabel
                              htmlFor={`customMarkFormatStyles.${index}.style`}
                            >
                              {$t`customMark.style`}
                            </InputLabel>
                            <Field
                              name={`customMarkFormatStyles.${index}.style`}
                              as="hidden"
                              id={`customMarkFormatStyles-${index}-style`}
                            />
                            <CodeblockComp
                              mode="css"
                              value={info.style}
                              onChange={(e, newVal) => {
                                setFieldValue(
                                  `customMarkFormatStyles.${index}.style`,
                                  newVal
                                );
                              }}
                            />
                            {isEmpty(info.name) && (
                              <FormHelperText>
                                {$t`customMark.support_less`}
                              </FormHelperText>
                            )}
                            <ErrorMessage
                              name={`customMarkFormatStyles.${index}.style`}
                              component="div"
                              className="field-error"
                            />
                          </Box>

                          <Box
                            sx={{
                              mb: 3,
                              pb: 3,
                              borderBottom: '1px solid var(--cl-slate-300)',
                            }}
                          >
                            <InputLabel>
                              {$t`customMark.trigger_pattern`}
                            </InputLabel>
                            <Field
                              name={`customMarkFormatStyles.${index}.trigger`}
                              type="text"
                              className={inputStyle}
                              placeholder="Optional"
                            />
                            {isEmpty(info.trigger) && (
                              <FormHelperText>
                                {$t`customMark.trigger_quote`}
                              </FormHelperText>
                            )}
                            <ErrorMessage
                              name={`customMarkFormatStyles.${index}.trigger`}
                              component="div"
                              className="field-error"
                            />
                          </Box>
                        </div>
                      ))}
                    <Button
                      color="primary"
                      type="submit"
                    >{$t`common.done`}</Button>
                    <Button
                      onClick={() => {
                        push({ name: '', style: placehoder });
                      }}
                    >
                      {$t`customMark.add_format`}
                    </Button>
                  </div>
                );
              }}
            </FieldArray>
          </Form>
        )}
      </Formik>
    </div>
  );
};
