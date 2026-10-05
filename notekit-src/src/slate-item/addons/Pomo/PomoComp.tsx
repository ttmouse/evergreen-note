import React from 'react';
import { cls, getColor, colorBase } from '../../styles';
import './pomo.less';

export type PomoNeededProps = {
  // 持续时间, 默认是 30 分钟
  duration?: number;
  // 开始时间
  startTime?: number;
  // 使用次数
  count?: number;
};

export type PomoCompProps = PomoNeededProps & {
  onStart?: () => void;
  onStop?: () => void;
};

export const POMO_DEFAULT_DURATION = 30;

function pad(n: number) {
  return `${n.toString().padStart(2, '0')}`;
}

// minutes to hh:mm:ss
function secondsToClock(seconds: number) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return { d, h, m, s };

  // const h = Math.floor(seconds / 3600);
  // const m = Math.floor((seconds % 3600) / 60);
  // const s = Math.floor(seconds % 60);

  // return `${h ? `${h}:` : ''}${m < 10 ? `0${m}` : m}:${s < 10 ? `0${s}` : s}`;
}

export function PomoComp(props: PomoCompProps = {}) {
  const {
    startTime,
    duration = POMO_DEFAULT_DURATION,
    onStart,
    onStop,
  } = props;
  const clock = secondsToClock(duration * 60);
  const [beginTime, setBeginTime] = React.useState<number>(startTime!);
  const isStart = beginTime && Date.now() < beginTime + duration * 60 * 1000;
  const [info, setInfo] = React.useState(clock);
  const [percent, setPercent] = React.useState(0);
  const [done, setDone] = React.useState(false);

  const cssClass = ['pomo-component'];

  React.useEffect(() => {
    if (isStart) {
      let t: any = null;
      const timer = () => {
        const now = Date.now();
        const diff = now - beginTime;
        setPercent((1 - diff / (duration * 60 * 1000)) * 100);
        const left = duration * 60 * 1000 - diff;
        if (left <= 0) {
          onStop && onStop();
          setDone(true);
        } else {
          setInfo(secondsToClock(left / 1000));
          t = setTimeout(timer, 1000);
        }
      };
      timer();
      return () => clearInterval(t);
    }
    setInfo(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginTime, duration]);

  const handleClick = () => {
    setBeginTime(Date.now());
    onStart && onStart();
    setDone(false);
  };

  const style: any = {};
  if (isStart) {
    style.backgroundColor = getColor(colorBase.success, 700);
  }

  done && cssClass.push('pomo-done');

  return (
    <span onClick={handleClick} className={cssClass.join(' ')} style={style}>
      <span className="pomo-icon" />
      <span className="pomo-block">
        {Number(info.d) > 0 && <span className="pomo-days">{info.d}</span>}
        {(Number(info.d) > 0 || Number(info.h) > 0) && (
          <span className="pomo-hours">{pad(info.h)}</span>
        )}
        <span className="pomo-minutes">{pad(info.m)}</span>
        <span className="pomo-seconds">{pad(info.s)}</span>
        {/* <span className="pomo-progress" style={{ width: `${percent}%` }} /> */}
      </span>
    </span>
  );
}
