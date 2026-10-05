import React from 'react';
import { UnitProps } from '../../interfaces/unit';
import { cls } from '../../styles';
import { isEmpty } from '../../utils/isEmpty';
import { EleBody, EleSubitems, EleHead, EleFoot } from '../Ele';
import { PartHead } from '../UnitView/PartHead';
import { PartIcon } from '../UnitView/PartIcon';
import { PartOuter, PartExtra } from '../UnitView/Parts';
import { listStyles } from './List.style';

const footStyle = cls`
  min-width: 100%;
`;

export function ListItemFoot(props: { body: Partial<UnitProps>[] | React.FC }) {
  const { body: FootBody } = props;
  if (typeof FootBody === 'function' || '$$typeof' in FootBody) {
    return (
      <EleFoot classFoot={footStyle}>
        <FootBody />
      </EleFoot>
    );
  }
  return null;
}

export const ListItem = (props: Partial<UnitProps> & { rowClassName?: string }) => {
  const { rowClassName, ...newProps } = props;
  if (!isEmpty(newProps.body)) {
    newProps.extra ??= [];
    newProps.extra.push({
      icon: 'svg_keyboard_arrow_right',
      unitType: 'UnitView',
    });
  }

  const { iconSize, foot, id, ...rest } = newProps;
  const header = <>
    <PartIcon classIcon={listStyles[1].icon} size={iconSize} {...rest} />
    <PartExtra classExtra={listStyles[1].extra} {...rest} />
    <PartHead classHead={listStyles[1].head} {...rest} />
  </>;

  return (
    <PartOuter classOuter={listStyles[1].node} {...newProps}>
      {rowClassName ? <div className={rowClassName}>{header}</div> : header}
      {isEmpty(rest.body) ? null : (
        <EleBody {...rest} classBody={listStyles[1].body}>
          <EleSubitems classChild={listStyles[1].child} {...rest}>
            {(rest.body as UnitProps[])?.map((item, i) => (
              <ListItem key={i} {...item} />
            ))}
          </EleSubitems>
        </EleBody>
      )}
      {foot ? <ListItemFoot body={foot} /> : null}
    </PartOuter>
  );
};

export const List = React.forwardRef((props: Partial<UnitProps>, ref) => {
  const newProps = { ...props };
  const { classOuter, iconSize, title, body, foot } = newProps;
  const nodeClass = `${listStyles[0].node} ${classOuter}`;
  const { id, ...rest } = newProps;

  return (
    <PartOuter {...newProps} classOuter={nodeClass} ref={ref}>
      <PartIcon size={iconSize} {...rest} />
      <PartExtra {...rest} classExtra={listStyles[0].extra} />
      <EleHead classHead={listStyles[0].head}>{title ?? ''}</EleHead>
      <EleBody classBody={listStyles[0].body}>
        <EleSubitems classChild={listStyles[0].child}>
          {(body as UnitProps[])?.map((item, i) => (
            <ListItem key={i} {...item} />
          ))}
        </EleSubitems>
      </EleBody>
      {foot ? <ListItemFoot body={foot} /> : null}
    </PartOuter>
  );
});
