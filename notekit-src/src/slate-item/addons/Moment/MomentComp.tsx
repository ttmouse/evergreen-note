import React, { useMemo } from 'react';
import { useAddons } from '../../hooks/useAddons';
import { Item, ItemNode } from '../../interfaces/item';
import { mkid } from '../../utils/string/mkid';
import { datekit, todayFmt, h24, fromNow } from '../../utils/date/datekit';
import Button from '@mui/material/Button';
import { LoadedAddons } from '../../../main';
import { ScrollLoad2 } from '../../notekit-ui/components/ScrollLoad/ScrollLoad';
import { CheckIcon as CheckIcon } from '@phosphor-icons/react';
import { LiveTimer } from '../../notekit-ui/components/LiveTimer/LiveTimer';
import { time } from '../../utils/date/time';
import { key2symbol } from '../Hotkey/helper';
import './moment.less';
import { atom, cls } from '../../styles';
import { isEmpty } from '@/slate-item/utils/isEmpty';

export type MomentProps = {};

const createLink = ($: LoadedAddons) => {
  return [
    { text: '' },
    $.bilink.createElement({
      topic: h24(),
      alias: datekit().format(`HH:mm`),
    }),
    { text: '' },
  ];
};

const firstItemID = 'editor-first-item-moment';

const createItem = ($: LoadedAddons) => {
  const ky = mkid();
  return Item.newItem({
    ky: `${ky}-moment`,
    pky: todayFmt(),
    // leaves: createLink($),
    ori: '',
    layout: 'markdown',
    moment: { v: true },
    created: time(),
    updated: time(),
    $requireChildren: true,
    subitems: [
      {
        pky: `${ky}-moment`,
        ky: `${ky}-1st-moment`,
        $id: firstItemID,
        ori: '',
        placeholder: '',
      },
    ],
  } as Partial<UnitPersist>);
};

export function MomentItemComp(props: { item: UnitPersist }) {
  const $ = useAddons();
  const { item } = props;
  const MyEditorComp = $.editorView.createComponent();
  return (
    <div className="moment-item" key={item.ky}>
      <MyEditorComp crumbsVisible item={item} />
      <span className="moment-time">
        <LiveTimer time={item.updated} format={fromNow} />
      </span>
    </div>
  );
}

export function MomentListComp(props: { list: UnitPersist[] }) {
  const { list } = props;
  const $ = useAddons();
  return (
    <>
      {list.map((one) => (
        <MomentItemComp item={one} />
      ))}
    </>
  );
}

export function MomentEditorComp() {
  const $ = useAddons();
  const EditorComp = $.editorView.createComponent();
  const [submits, setSubmits] = React.useState<UnitPersist[]>([]);

  const [item, setItem] = React.useState(createItem($));
  const handleSubmit = React.useCallback(() => {
    const theItem = $.dbMemory.getItem(item.ky, { isRecur: true });
    if (!isEmpty(theItem)) {
      setSubmits((items) => [theItem, ...items]);
      setItem(createItem($));
    }
  }, [$, item.ky]);

  const editor = $.editorFactory.create();

  React.useEffect(() => {
    try {
      editor.itemFocusEnd('0,0');
    } catch (e) {
      console.error(e);
    }

    const fn = (e: KeyboardEvent) => {
      if (
        e.key === 'Enter' &&
        e.altKey &&
        document.activeElement?.getAttribute('data-editor-id') ===
          String(editor.editorId)
      ) {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', fn);
    return () => {
      window.removeEventListener('keydown', fn);
    };
  }, [editor, handleSubmit]);

  const onChange = (val: ItemNode[]) => {
    const [topItem] = val;
    if (!$.dbMemory.itemExist(topItem.ky) && !editor.itemTextTreeIsEmpty([0])) {
      $.dbMemory.saveItem({
        ...topItem,
        leaves: createLink($),
      });
    }
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if ((e.target as HTMLElement).matches('.moment-header')) {
      const lastPath = editor.itemPathLastSubitem([0]);
      editor.itemFocusEnd(lastPath);
    }
  };

  return (
    <>
      <section key="editor" className="moment-header" onClick={onClick}>
        <div className="moment-editor">
          <EditorComp editor={editor} item={item} onChange={onChange} />
        </div>
        <div className="moment-editor-toolbar">
          <div className="moment-toolbar"> </div>
          <div className="moment-submit">
            <span className="moment-hotkey">{key2symbol('alt+enter')}</span>
            <Button variant="outlined" size="small" onClick={handleSubmit}>
              <CheckIcon />
            </Button>
          </div>
        </div>
      </section>

      <section key="submit" className="moment-list moment-new">
        <MomentListComp list={submits} />
      </section>
    </>
  );
}

const wrapStyles = [
  cls`
    ${atom.xl('width: 700px')};
    ${atom.lg('width: 700px')};
    ${atom.md('width: 700px')};
    ${atom.sm('width: 100vw')};
  `,
  'moment-wrap',
];

export function MomentComp() {
  const $ = useAddons();

  return (
    <div className={wrapStyles.join(' ')}>
      <MomentEditorComp />
      <section key="list" className="moment-list moment-old" style={{paddingBottom: '100vh'}}>
        <ScrollLoad2 renderItem={MomentItemComp} list={$.moment.getList()} />
      </section>
    </div>
  );
}
