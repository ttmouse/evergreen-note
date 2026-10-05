import React from 'react';
import { ElementComponentProps } from '../../EditorView/EditorView';
import { InlineOuterComp } from '../../Inlines/InlineOuterComp';
import { DatePickerElement } from './DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs, { Dayjs } from 'dayjs';
import { isEmpty } from '../../../../assets/js/codemirror/src/util/misc';
import { cls, preset } from '../../../styles';
import { ReactEditor } from '../../../slate.inc';
import { useEditor } from '../../../hooks/useEditor';
import { useAddons } from '../../../hooks/useAddons';
import { YYYY_MM_DD } from '../../../utils/date/datekit';
import { DesktopDatePicker } from '@mui/x-date-pickers';

export type DateProps = {};

const style = [
  cls`
    display: inline-flex;
    width: fit-content;
    padding: 0px 10px 0px 4px;
    margin: 0px 4px;
    border-radius: 4px;
    background-color: var(--cl-slate-200);
    cursor: pointer;
    ${preset.link.basic};

    &:hover {
      [data-date] {
        text-decoration: underline;
      }
    }

    input {
      width: 100%;
    }

    .MuiInputAdornment-root {
      max-width: 30px;
      margin: 0;
      height: auto;
      transform: scale(0.7);

      button {
        padding: 0px;
      }
    }
  `,
];

export function DatePickerElementComp(
  props: ElementComponentProps<DatePickerElement>
) {
  const { element } = props;
  const editor = useEditor();
  const $ = useAddons();
  const [value, setValue] = React.useState<Dayjs | null>(dayjs(element.value));
  const textRef = React.useRef<HTMLInputElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const setElValue = (val: Dayjs) => {
    const fmtDate = val.format(YYYY_MM_DD);
    const path = ReactEditor.findPath(editor as any, element);
    $.inlines.setProps<DatePickerElement>(editor, path, {
      value: fmtDate,
      iky: element.iky,
    });
    // $.inlines.setText(editor, path, fmtDate);
  };

  React.useEffect(() => {
    if (isEmpty(element.value)) {
      textRef.current?.click();
      textRef.current?.focus();
      wrapRef.current?.querySelector('button')?.click();
      setElValue(dayjs());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (newValue: Dayjs | null) => {
    if (newValue) {
      setElValue(newValue);
      // editor.restoreSelection(1);
    }
  };

  const fmtDate = dayjs(value).format(YYYY_MM_DD);

  const inner = (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DesktopDatePicker
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          onChange?.(newValue);
        }}
        inputRef={textRef}
        closeOnSelect
        renderInput={({ inputRef, inputProps, InputProps }) => (
          <span className={style.join(' ')} ref={wrapRef}>
            <span
              onMouseDown={() => $.datePicker.route(fmtDate, {}, editor)}
              ref={inputRef}
              {...inputProps}
              data-date={fmtDate}
            >
              {fmtDate}
            </span>
            {InputProps?.endAdornment}
          </span>
        )}
      />
    </LocalizationProvider>
  );
  return <InlineOuterComp inner={inner} {...props} />;
}
