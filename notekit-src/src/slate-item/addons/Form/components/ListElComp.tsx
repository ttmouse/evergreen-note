import * as React from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Checkbox from '@mui/material/Checkbox'
import { FormElProps } from '../Form'
import { CustomElComp } from './CustomElComp'
import { useChange } from '../helper'

export default function ListElComp(props: FormElProps<any>) {
  const { value = [], name, options = {} } = props

  // const [val, setVal] = React.useState<number | null>(Number(value) ?? 2);
  // const onChange = useChange(props);
  // const handleChange = (
  //   event: React.ChangeEvent<{}>,
  //   newValue: number | null
  // ) => {
  //   onChange(null, newValue as any);
  //   setVal(newValue);
  // };

  const change = useChange(props)
  const [checked, setChecked] = React.useState<string[]>(value as any)

  const handleToggle = (val: string) => () => {
    const currentIndex = checked.indexOf(val)
    const newChecked = [...checked]

    if (currentIndex === -1) {
      newChecked.push(val)
    } else {
      newChecked.splice(currentIndex, 1)
    }

    setChecked(newChecked)
    change(null, newChecked as any)
  }

  return (
    <CustomElComp {...props}>
      <List
        sx={{
          width: '100%',
          bgcolor: 'background.paper',
          '& .MuiListItem-root > .MuiButtonBase-root': {
            paddingLeft: '0 !important',
          },
          maxHeight: '300px',
          overflow: 'auto',
        }}
      >
        {Object.entries(options).map(([theKey, theLabel]) => {
          const labelId = `checkbox-list-label-${theKey}`

          return (
            <ListItem key={theKey} disablePadding>
              <ListItemButton
                role={undefined}
                onClick={handleToggle(theKey)}
                dense
              >
                <ListItemIcon>
                  <Checkbox
                    edge="end"
                    checked={checked.includes(theKey)}
                    tabIndex={-1}
                    disableRipple
                    inputProps={{ 'aria-labelledby': labelId }}
                  />
                </ListItemIcon>
                <ListItemText id={labelId} primary={theLabel} />
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
    </CustomElComp>
  )
}
