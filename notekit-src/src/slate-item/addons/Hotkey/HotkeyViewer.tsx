import React from 'react';
import { useAddons } from '../../hooks/useAddons';
import { cls, colorBase } from '../../styles';
import { key2symbol } from './helper';

export type HotkeyViewerProps = {};

const trStyle = cls`
  box-shadow: 0px 1px 0px 0px var(--cl-slate-100);
  &:hover {
    box-shadow: 0px 1px 0px 0px var(--cl-slate-200);
  }
`;

const thStyle = cls`
  text-align: left;
`;

const tdStyle = cls`
  text-align: left;
  padding: 8px;

  code {
    background-color: #eee;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    color: ${[colorBase.primary, 600]};
  }
`;

const scopeStyle = cls`
  text-align: left;
  padding: 8px;
  white-space: nowrap;
  color: var(--cl-slate-500);
  font-size: 0.9em;
`;

/**
 * 命令的生效范围。
 *
 * 面板过去只列键位，而其中三分之二的命令只在「光标在笔记里」时才响应，
 * 用户按了没反应会以为快捷键坏了 —— 这里把范围写出来。
 */
function scopeLabel(context?: string) {
  if (context === 'everywhere') return '任意位置';
  if (context === 'global') return '笔记外';
  return '笔记内';
}

export function HotkeyViewerComp(props: HotkeyViewerProps) {
  const { hotkey } = useAddons();
  return (
    <table>
      {Object.values(hotkey.commands).map((cmd) => (
        <tr className={trStyle}>
          <th className={thStyle}>{cmd.title}</th>
          <td className={tdStyle}>
            <code>{key2symbol(cmd.hotkey)}</code>
          </td>
          <td className={scopeStyle}>{scopeLabel(cmd.context)}</td>
        </tr>
      ))}
    </table>
  );
}
