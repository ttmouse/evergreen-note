import React from 'react';
import { AutoComplete } from '../../components/AutoComplete/AutoComplete';
import { UnitProps } from '../../interfaces/unit';
import { useAddons } from '../../hooks/useAddons';
import { ItemEditor } from '../..';
import { ContextEditor } from '../EditorView/EditorViewContexts';

export const EmbedMenuComp = React.memo(() => {
  const editor = React.useContext(ContextEditor) as ItemEditor;
  const { embed } = useAddons();

  const handleSelect = ({
    item,
    closeMenu,
  }: {
    item: UnitProps;
    closeMenu: (isClose: boolean) => void;
  }) => {
    item?.handle({ editor, closeMenu });
    closeMenu(true);
  };

  return (
    <AutoComplete
      id="embed-autocomplete"
      handleSelect={handleSelect}
      {...embed.getSuggestMenu({ editor })}
    />
  );
});
