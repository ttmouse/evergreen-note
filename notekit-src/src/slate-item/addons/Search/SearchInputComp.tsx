import * as React from 'react';
import Paper from '@mui/material/Paper';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import { MagnifyingGlassIcon as SearchIcon } from '@phosphor-icons/react';
import { $t } from '../../../i18n';

export type SearchInputProps = {
  value: string;
  icon?: React.ReactNode;
  placeholder?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClickIcon?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

export function SearchInputComp(props: SearchInputProps) {
  const {
    value = '',
    onChange,
    onClickIcon,
    placeholder = $t`searchDialog.quote`,
    icon = <SearchIcon />,
  } = props;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
      e.preventDefault();
      e.stopPropagation();
      // (e.target as HTMLInputElement).blur();
      onChange(e as any);
    }
  };

  return (
    <Paper
      component="div"
      sx={{
        p: '2px 4px',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        marginTop: '8px',
      }}
    >
      <InputBase
        sx={{ ml: 1, flex: 1 }}
        placeholder={placeholder}
        inputProps={{ 'aria-label': placeholder }}
        onBlur={onChange as any}
        onKeyDown={onKeyDown}
        defaultValue={value}
        className="search-input-wrap"
      />
      <IconButton
        onClick={(e) => onClickIcon?.(e)}
        type="submit"
        sx={{ p: '10px' }}
        aria-label={$t`searchDialog.quote`}
      >
        {icon}
      </IconButton>
    </Paper>
  );
}
