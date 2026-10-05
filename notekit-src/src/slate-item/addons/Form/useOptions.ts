import React from 'react';
import { $t } from '../../../i18n';
import { useAddons } from '../../hooks/useAddons';
import { omit } from '../../utils/object/omit';
import { Options } from './Form';

export function useOptions(params: {
  options: Options;
  formik: any;
  value: any;
  name: string;
  canMore?: boolean;
}) {
  // eslint-disable-next-line prefer-const
  let { options, formik, value, canMore, name } = params;
  if (canMore) {
    options = {
      ...options,
      $other: $t`common.others`,
    };
  }
  const [moreOptions, setMoreOptions] = React.useState<Options>(options);
  const $ = useAddons();
  const [val, setVal] = React.useState(value);

  const handleMoreChange = (e: any, v: any) => {
    if (v === '$other' && canMore) {
      $.form.popup({
        subitems: {
          newOption: {
            type: 'text',
            title: $t`common.new_option`,
            autoFocus: true,
          },
        },
        buttons: {
          [$t`common.add`]: (values) => {
            setMoreOptions({
              ...omit(moreOptions, ['$other']),
              [values.newOption as string]: values.newOption,
            });
            setTimeout(() => {
              setVal(values.newOption as any);
              formik.setFieldValue(name, values.newOption);
            }, 10);
          },
          [$t`common.cancel`]: null,
        },
      });
    }
  };

  return {
    value: val,
    setVal,
    options: moreOptions,
    onChange: handleMoreChange,
  };
}
