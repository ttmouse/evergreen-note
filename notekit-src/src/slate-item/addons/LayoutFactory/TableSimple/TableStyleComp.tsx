import React from 'react';
import { observer } from 'mobx-react';
import { useAddons } from '../../../hooks/useAddons';
import { ContextLayoutItem } from '../LayoutContexts';

export const TableStyleComp = observer(() => {
  const { tableSimple } = useAddons();
  const tableItem = React.useContext(ContextLayoutItem);
  const widths = tableSimple.getColWidths(tableItem.ky);
  const styleContent = widths.map((width, index) => {
    if (width < 1) {
      return '';
    }
    let selector: string;
    if (index === 0) {
      selector = `#${tableItem.$id} > .node-body > .node-subitems > .node > .node-head`;
    } else {
      // eslint-disable-next-line prettier/prettier
      selector = `#${tableItem.$id} > .node-body > .node-subitems > .node > .node-body > .node-subitems > .node:nth-child(${index})`;
      // selector = `#${tableItem.$id} .node-layout-tablesimple-2[data-table-ky="${tableItem.ky}"]:nth-child(${index})`;
    }
    return `${selector} { min-width: ${width}px; flex-basis: ${width}px; }`;
  });
  return <style>{styleContent.join('\n')}</style>;
});
