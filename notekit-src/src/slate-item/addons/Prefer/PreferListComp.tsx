import * as React from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import { Tip } from '../../components/Tip/Tip'
import { useAddons } from '../../hooks/useAddons'
import { observer } from 'mobx-react'
import { cls } from '../../styles'
import { $t } from '../../../i18n'
import { TrashSimpleIcon as DeleteOutlineIcon } from '@phosphor-icons/react';
import { PencilSimpleIcon as EditIcon } from '@phosphor-icons/react';
import { updateSnack } from '../../utils/msg/showSnack'
import { pub } from '../../utils/pub'

const snackID = 'opening-lib'
pub.on(pub.evt.uiMounted, () => {
  updateSnack(snackID, { autoClose: 0 })
})

export const PreferListComp = observer(() => {
  const $ = useAddons()

  return (
    <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {$.preferPlan.store.getList().map((item) => {
        const labelId = `checkbox-list-label-${item.ky}`
        const clickEdit = (e: React.MouseEvent) => {
          $.preferPlan.showUpdateForm({ ky: item.ky as any })
          e.stopPropagation()
        }
        const clickDelete = (e: React.MouseEvent) => {
          if (window.confirm($t`common.delete_confirm`)) {
            $.preferPlan.delete(item.ky as any)
          }
          e.stopPropagation()
        }

        return (
          <ListItem
            key={item.ky}
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
                <Tip title={$t`common.edit`}>
                  <IconButton
                    onClick={clickEdit}
                    edge="end"
                    aria-label="comments"
                  >
                    <EditIcon />
                  </IconButton>
                </Tip>
                <Tip title={$t`common.delete`}>
                  <IconButton
                    onClick={clickDelete}
                    edge="end"
                    aria-label="delete"
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Tip>
              </span>
            }
            disablePadding
          >
            <ListItemButton dense>
              <ListItemText
                id={labelId}
                primary={<strong>{item.ori}</strong>}
                secondary={item.quote ?? ''}
              />
            </ListItemButton>
          </ListItem>
        )
      })}
    </List>
  )
})
