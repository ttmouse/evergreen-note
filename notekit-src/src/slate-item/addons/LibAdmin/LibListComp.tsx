import * as React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import { Tip } from '../../components/Tip/Tip';
import { useAddons } from '../../hooks/useAddons';
import { observer } from 'mobx-react';
import { cls } from '../../styles';
import { $t } from '../../../i18n';
import { TrashSimpleIcon as DeleteOutlineIcon } from '@phosphor-icons/react';
import { PencilSimpleIcon as EditIcon } from '@phosphor-icons/react';
import { HouseIcon as HomeIcon } from '@phosphor-icons/react';
import { showSnack, updateSnack } from '../../utils/msg/showSnack';
import { pub } from '../../utils/pub';
import LinearProgress from '@mui/material/LinearProgress';
import { Keyword } from '../../notekit-ui/styled';
import { UNIT_ROLE } from '../../interfaces/unit';

const snackID = 'opening-lib';
pub.on(pub.evt.uiMounted, () => {
  updateSnack(snackID, { autoClose: 0 });
});

export const LibListComp = observer(() => {
  const $ = useAddons();

  return (
    <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {$.libAdmin.store
        .getList()
        .filter((lib) => lib.role === UNIT_ROLE.LIBRARY)
        .map((lib) => {
          const labelId = `checkbox-list-label-${lib.ky}`;
          const clickOpen = (e: React.MouseEvent) => {
            $.libAdmin.closeList();
            if (lib.ky === $.libAdmin.current.ky) {
              return;
            }
            showSnack({
              content: (
                <span>
                  {$t`libAdmin.opening_library`}
                  <LinearProgress />
                </span>
              ),
              id: snackID,
              vertical: 'top',
              horizontal: 'left',
              severity: 'info',
            });
            $.libAdmin.route(lib.ky as any);
            e.stopPropagation();
          };
          const clickEdit = (e: React.MouseEvent) => {
            $.libAdmin.showUpdateForm({ ky: lib.ky as any });
            e.stopPropagation();
          };
          const clickDelete = (e: React.MouseEvent) => {
            if (window.confirm($t`common.delete_confirm`)) {
              $.libAdmin.delete(lib.ky as any);
            }
            e.stopPropagation();
          };
          const clickHome = (e: React.MouseEvent) => {
            $.preferGlobal.setValue('globalDefaultLibrary', lib.ky);
            e.stopPropagation();
          };

          return (
            <ListItem
              key={lib.ky}
              className={cls`
              .op-icons { opacity: 0; transition: opacity 0.3s; }
              &:hover .op-icons { opacity: 1; }
            `}
              secondaryAction={
                <span
                  className={[
                    cls`& > * { margin-left: 16px !important; }`,
                    'op-icons',
                  ].join(' ')}
                >
                  <Tip title={$t`prefer.set_default_library`}>
                    <IconButton
                      onClick={clickHome}
                      edge="end"
                      aria-label="set default library"
                    >
                      <HomeIcon size={20} />
                    </IconButton>
                  </Tip>
                  <Tip title={$t`common.edit`}>
                    <IconButton
                      onClick={clickEdit}
                      edge="end"
                      aria-label="edit"
                    >
                      <EditIcon size={20} />
                    </IconButton>
                  </Tip>
                  <Tip title={$t`common.delete`}>
                    <IconButton
                      onClick={clickDelete}
                      edge="end"
                      aria-label="delete"
                    >
                      <DeleteOutlineIcon size={20} />
                    </IconButton>
                  </Tip>
                  {/* <IconItem icon="svg_more" subitems={subitems} /> */}
                </span>
              }
              disablePadding
              onClick={clickOpen}
            >
              <ListItemButton dense>
                <ListItemText
                  id={labelId}
                  primary={
                    <>
                      <strong>{lib.ori}</strong>
                      {$.preferGlobal.getValue('globalDefaultLibrary') ===
                        lib.ky && (
                        <Keyword color="blue" style={{ marginLeft: 4 }}>
                          default
                        </Keyword>
                      )}
                    </>
                  }
                  secondary={
                    <>
                      <Keyword
                        color="slate"
                        depth={200}
                        style={{ marginRight: 4 }}
                      >
                        {$.preferPlan.get(lib.referConfig)?.ori}
                      </Keyword>
                      {lib.quote ?? ''}
                    </>
                  }
                />
              </ListItemButton>
            </ListItem>
          );
        })}
    </List>
  );
});
