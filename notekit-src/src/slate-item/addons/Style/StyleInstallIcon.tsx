import React from 'react'
import Chip from '@mui/material/Chip'
import { useItem } from '../../hooks/useItem'
import { useAddons } from '../../hooks/useAddons'
import { $t } from '../../../i18n'

export function StyleInstallIcon(props: any) {
  const item = useItem()
  if(!item.leaves?.some((leaf: any) => leaf?.mode === 'css')) return null
  const $ = useAddons()
  const [isInstalled, setIsInstalled] = React.useState(
    $.style.isInstalled(item.ky)
  )

  const label = isInstalled ? $t`style.installed_text` : $t`style.install_text`
  const color = isInstalled ? 'success' : 'default'

  const onClick = (e: React.MouseEvent) => {
    if (item.leaves?.some($.codeblock.verify)) {
      $.style.toggle(item.ky)
      setIsInstalled(!isInstalled)
    }
    e.stopPropagation()
  }

  return (
    <Chip
      size="small"
      onClick={onClick}
      label={label}
      color={color}
      variant="outlined"
      sx={{ order: 10000 }}
    />
  )
}
