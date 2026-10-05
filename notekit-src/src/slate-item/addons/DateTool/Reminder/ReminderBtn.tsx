import React from 'react';
import Chip from '@mui/material/Chip';
import { useAddons } from '../../../hooks/useAddons';
import { useItem } from '../../../hooks/useItem';
import { isEmpty } from '../../../utils/isEmpty';
import { ItemWithReminder } from './Reminder';
import { AlarmIcon as AccessAlarmIcon } from '@phosphor-icons/react';
import { cls } from '../../../styles';
import { $t } from '../../../../i18n';
import { CheckIcon as DoneIcon } from '@phosphor-icons/react';
import { isInfinity } from '../../../utils/number/isInfinity';
import { TrashSimpleIcon as AutoDeleteIcon } from '@phosphor-icons/react';
import { ContextEditorInline } from '../../EditorView/EditorViewContexts';
import { getBoxInfo } from '../../../utils/calcSnap';
import { PLAN_STATUS } from './countdown';
import { isNumber } from 'lodash';
import { Item } from '@/slate-item';
import { Logic } from '../../Traits/Logic';

const theStyle = cls`
  cursor: pointer;
  padding: 0px 8px;

  .MuiChip-root {
    display: inline-flex !important;
    flex-direction: row-reverse !important;

    .MuiChip-label {
      padding: 0px !important;
    }
  }

  .MuiChip-deleteIcon {
    opacity: 0;
    transition: opacity 0.3s;
  }`;

const styleHoverStyle = cls`
  &:hover .MuiChip-deleteIcon {
    opacity: 1;
  }
`;

let logic: Logic | null = null;

export function ReminderAddBtn() {
  const ctxItem = useItem() as ItemWithReminder;
  const $ = useAddons();

  const plan = $.reminder.getPlan(ctxItem);
  const isReferCxt = React.useContext(ContextEditorInline);
  if (!logic) logic = $.traits.createLogic('is:todo');
  if (isReferCxt || plan || !logic.test(ctxItem)) {
    return null;
  }

  const onClick = (e: React.MouseEvent) => {
    const rect = getBoxInfo(e.currentTarget.getBoundingClientRect());
    rect.left -= 60;
    $.reminder.showForm({
      item: ctxItem,
      SnapProps: {
        targetBox: rect,
        place: ['left-out', 'middle'],
      },
    });
  };

  const style = cls`
    cursor: pointer;
    margin-right: 2px;
    order: 9999;

    svg {
      transition: 0.3s all;
      fill: var(--cl-slate-200);
    }

    &:hover svg {
      fill: var(--cl-red-600);
    }
  `;

  return (
    <span onClick={onClick} className={style}>
      <AccessAlarmIcon size={20} />
    </span>
  );
}

export function ReminderBtn() {
  const ctxItem = useItem() as ItemWithReminder;
  const $ = useAddons();

  const plan = $.reminder.getPlan(ctxItem);
  const isReferCxt = React.useContext(ContextEditorInline);
  if (isReferCxt || !plan || isEmpty(plan?.dueDate)) {
    return null;
  }

  const days = $.reminder.calcDueDays(ctxItem);
  let label = plan.dueDate ?? '';
  let color = 'warning';
  let icon = <AccessAlarmIcon />;
  let deleteIcon = <DoneIcon />;
  let [dateTypeSwitch, setDateTypeSwitch] = React.useState(false);
  let onDelete = () => $.reminder.setStatus(ctxItem, 'done');
  const clearFn = () => $.reminder.clear(ctxItem);

  if (isInfinity(days)) {
    label = 'Never';
    color = 'default';
    deleteIcon = null as any;
    onDelete = clearFn;
  } else if (days === 0) {
    label = $t`reminder.today`;
    color = 'error';
  } else if (days === 1) {
    label = $t`reminder.tomorrow`;
  } else if (days === -1) {
    label = $t`reminder.yesterday`;
    color = 'default';
  } else {
    if (days > 1 && days < 7) {
      if (dateTypeSwitch) label = $t(`reminder.someday`, { days });
      else label = $.reminder.calcDueDate(ctxItem); 
    } else if (days < -1) {
      color = 'default';
      if (dateTypeSwitch) label = $.reminder.calcDueDate(ctxItem);
      else label = $t(`reminder.somedayago`, { days: -days });
    } else if (days >= 7) {
      if (dateTypeSwitch) label = $t(`reminder.someday`, { days });
      else label = $.reminder.calcDueDate(ctxItem);
    }
  }
  const userFriendlyTimeDelta = (e: string) => {
    let result="";
    if(!e || e === "0") return result;
    result += " ";
    if(/^0[，,]|[，,]0$|[，,]0[，,]/g.test(e)) result += "and ";
    result += (e.replace(/^0[，,]|[，,]0$|[，,]0[，,]/g, (match) => {
      return (match[0]!== '0' && match[match.length - 1] !== '0') ? ',' : '';
    }).replace(/，/g, ','))
    return result;
  };
  if (plan.timeSensitive && plan.repeatPlan !== "never") {
    if(plan.time) label = `${label} ${plan.time}`;
  }
  label = `${label}${userFriendlyTimeDelta(plan.timeDelta)}`;

  const classList: string[] = [theStyle, styleHoverStyle, 'reminder-btn'];

  if (plan?.status === PLAN_STATUS.discard) {
    label = $t`reminder.discard`;
    color = 'default';
    onDelete = clearFn;
    icon = <AutoDeleteIcon />;
    deleteIcon = null as any;
  } else if (plan?.status === PLAN_STATUS.done) {
    color = 'success';
    label = $t`reminder.done`;
    icon = <DoneIcon />;
    deleteIcon = null as any;
    onDelete = clearFn;
  } else {
    // nothing
  }

  let visibleTimer = null as NodeJS.Timer | null;
  const onMouseEnter = () => {
    if (visibleTimer) clearTimeout(visibleTimer)
    setDateTypeSwitch(true)
  }
  const onMouseLeave = () => {
    if (visibleTimer) clearTimeout(visibleTimer)
    visibleTimer = setTimeout(() => setDateTypeSwitch(false), 300)
  }
  const onTouchStart = () => {
    if (visibleTimer) clearTimeout(visibleTimer)
    setDateTypeSwitch(true)
  }
  const onTouchEnd = () => {
    if (visibleTimer) clearTimeout(visibleTimer)
    visibleTimer = setTimeout(() => setDateTypeSwitch(false), 300)
  }

  return (
    <span
      className={classList.join(' ')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Chip
        size="small"
        icon={icon}
        color={color as any}
        variant="outlined"
        onDelete={onDelete}
        deleteIcon={deleteIcon}
        label={label}
        style={{ border: 'none' }}
      />
    </span>
  );
}
