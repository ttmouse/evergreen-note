import React from 'react';
import { useItem } from '../../hooks/useItem';
import { useIsReferContext } from '../../hooks/useIsReferContext';
import { isEmpty } from '../../utils/isEmpty';
import Chip from '@mui/material/Chip';
import { useAddons } from '../../hooks/useAddons';
import { $$ } from '../../utils/lang';
import { $t } from '../../../i18n';
import { useEditor } from '../../hooks/useEditor';
import { Tip } from '../../components/Tip/Tip';

export function SnippetConditionBtn() {
  const ctxItem = useItem();
  const editor = useEditor();
  const { snippet } = useAddons();

  const onClick = (e: React.MouseEvent) => {
    snippet.showForm({
      editor,
      item: ctxItem,
      SnapProps: {
        targetBox: e.target as HTMLElement,
        place: ['right-in', 'bottom-out'],
      },
    });
  };

  const isReferCxt = useIsReferContext();
  if (isReferCxt || typeof ctxItem.SNIPPET === 'undefined') {
    return null;
  }

  const label = isEmpty(ctxItem.SNIPPET)
    ? $t`snippet.setting_button`
    : ctxItem.SNIPPET;

  return (
    <Tip title={`${$t`common.edit`}${$t`snippet.title`}`}>
      <Chip
        size="small"
        color={isEmpty(ctxItem.SNIPPET) ? 'default' : 'primary'}
        variant="outlined"
        onClick={onClick}
        label={label}
      />
    </Tip>
  );
}
