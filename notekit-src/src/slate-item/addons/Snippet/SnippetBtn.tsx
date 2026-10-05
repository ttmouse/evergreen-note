import React from 'react';
import Button from '@mui/material/Button';
import { useItem } from '../../hooks/useItem';
import { SNIPPET_TOPIC_KY } from './Snippet';
import { useAddons } from '../../hooks/useAddons';
import { useEditor } from '../../hooks/useEditor';
import { appendStyle } from '../../utils/dom/appendStyle';
import { cls } from '../../styles';
import { IconItem } from '../../components';
import { $t } from '../../../i18n';

appendStyle(cls`
  .node-head {
    > .node-extra .snippet-turninto-btn {
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
    }

    &:hover {
      > .node-extra .snippet-turninto-btn {
        opacity: 1;
      }
    }
  }
`);

export function SnippetBtn() {
  const item = useItem();
  const editor = useEditor();
  const { crumbs, snippet, traits } = useAddons();
  if (
    !crumbs.getPath(item).includes(SNIPPET_TOPIC_KY) ||
    snippet.isSnippet(item) ||
    traits.match('under:is:snippet OR has:is:snippet', item)
  ) {
    return null;
  }

  const onClick = () => {
    snippet.turnIntoSnippet(editor, item);
  };

  return (
    <IconItem
      className="snippet-turninto-btn"
      onClick={onClick}
      icon="svg_snippet"
      title={$t`snippet.turn_into_snippet`}
    />
  );
}
