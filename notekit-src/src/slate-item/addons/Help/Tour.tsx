import React from 'react';
import ReactDOM from 'react-dom';
import { cls } from '../../styles';
import { BoxInfo } from '../../utils/calcSnap';
import { useAddons } from '../../hooks/useAddons';

export type TourProps = {
  tips: [
    {
      title: string;
      content: string;
      selector: string;
    }
  ];
};

const paneStyle = cls`
  position: fixed;
  background-color: rgba(0, 0, 0, 0.8);
`;

export function Pane(props: BoxInfo) {
  return <div className={paneStyle} style={props} />;
}

export function PaneList(props: BoxInfo) {
  const $ = useAddons();
  const { left, top, width, height } = props;
  const topPaneBox: BoxInfo = {
    left: 0,
    top: 0,
    width: '100%' as any,
    height: top,
  };
  const bottomPaneBox: BoxInfo = {
    left: 0,
    top: top + height,
    width: '100%' as any,
    height: `calc(100% - ${top + height}px)` as any,
  };
  const leftPaneBox: BoxInfo = {
    left: 0,
    top,
    width: left,
    height,
  };
  const rightPaneBox: BoxInfo = {
    left: left + width,
    top,
    width: `calc(100% - ${left + width}px)` as any,
    height,
  };
  return ReactDOM.createPortal(
    <>
      <Pane {...topPaneBox} />
      <Pane {...bottomPaneBox} />
      <Pane {...leftPaneBox} />
      <Pane {...rightPaneBox} />
    </>,
    $.ui.getContainer()
  );
}
