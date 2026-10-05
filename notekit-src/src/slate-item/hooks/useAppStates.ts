import React from 'react';
import { ContextApp } from '../addons/UI/UIContexts';

export function useAppStates() {
  return React.useContext(ContextApp).states;
}
