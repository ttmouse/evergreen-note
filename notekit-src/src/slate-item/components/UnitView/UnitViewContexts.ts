import React from 'react';
import { UnitMode } from '../../interfaces/unit';

export const ContextLayoutProps = React.createContext([] as any);
export const ContextUnitMode = React.createContext(
  UnitMode.EditFirst as UnitMode
);
export const ContextLayout = React.createContext('node');
export const ContextTheme = React.createContext({} as any);
