import { useContext } from 'react';
import { ContextApp } from '../addons/UI/UIContexts';

/**
 * 支持国际化多语言
 * @returns
 */
export function useLang() {
  return useContext(ContextApp).langs;
}
