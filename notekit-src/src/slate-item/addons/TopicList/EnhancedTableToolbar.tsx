import React from 'react';
import { alpha } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { TrashIcon as DeleteIcon } from '@phosphor-icons/react';
import { FunnelSimpleIcon as FilterListIcon } from '@phosphor-icons/react';
import { KyString } from '../../interfaces/unit';
import { useAddons } from '../../hooks/useAddons';
import { mkid } from '../../utils/string/mkid';
import { pub } from '../../utils/pub';
import { useLang } from '../../hooks/useLang';
import InputAdornment from '@mui/material/InputAdornment';
import Input from '@mui/material/Input';
import { MagnifyingGlassIcon as SearchIcon } from '@phosphor-icons/react';
import { atLater } from '../../utils/atLater';
import { isEmpty } from '../../utils/isEmpty';
import FormHelperText from '@mui/material/FormHelperText';
import { $t } from '../../../i18n';

interface EnhancedTableToolbarProps {
  numSelected: number;
  selected: readonly string[];
  sx: { [k: string]: any };
  setList: any;
  setKeyword: any;
}

export const EnhancedTableToolbar = (props: EnhancedTableToolbarProps) => {
  const { numSelected, selected, setList, setKeyword } = props;
  const { topicList, search } = useAddons();
  const langs = useLang();
  const handleDelete = async () => {
    if (window.confirm($t`common.delete_confirm`)) {
      topicList.handleDelete(selected as KyString[]);
      pub.emit(pub.evt.topicListDelete, selected);
    }
  };

  const [help, setHelp] = React.useState('');

  return (
    <Toolbar
      sx={{
        pl: { sm: 2 },
        pr: { xs: 1, sm: 1 },
        ...(numSelected > 0 && {
          bgcolor: (theme) =>
            alpha(
              theme.palette.primary.main,
              theme.palette.action.activatedOpacity
            ),
        }),
      }}
    >
      {numSelected > 0 ? (
        <Typography
          sx={{ flex: '1 1 100%' }}
          color="inherit"
          variant="subtitle1"
          component="div"
        >
          {numSelected} selected
        </Typography>
      ) : (
        <Typography
          sx={{ flex: '1 1 100%' }}
          variant="h6"
          id={mkid()}
          component="div"
        >
          <Input
            id="input-with-icon-adornment"
            placeholder="Search..."
            sx={{ width: '100%', maxWidth: 480, minWidth: 200, pr: 2 }}
            onChange={(e) => {
              const k = e.target.value;
              let result = topicList.getList();
              if (k.length > 0) {
                const kw = k.includes('is:daily') ? k : `has(${k})`;
                result = search.findAll(kw, {
                  limit: 50,
                  isRecur: false,
                  items: result,
                });
              }
              atLater(
                () => {
                  setList(result);
                  setKeyword(e.target.value);
                  if (isEmpty(result)) {
                    setHelp('No result');
                  } else {
                    setHelp('');
                  }
                },
                'topic-list-search',
                500
              );
            }}
            startAdornment={
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            }
          />
          <FormHelperText id="component-error-text">{help}</FormHelperText>
        </Typography>
      )}
      {numSelected > 0 ? (
        <Tooltip title="Delete" onClick={handleDelete}>
          <IconButton>
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      ) : (
        // <Tooltip title="Filter list">
        //   <IconButton>
        //     <FilterListIcon />
        //   </IconButton>
        // </Tooltip>
        <></>
      )}
    </Toolbar>
  );
};
