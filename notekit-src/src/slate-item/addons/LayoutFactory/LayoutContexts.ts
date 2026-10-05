import React from 'react';
import { ItemNode } from '../../interfaces/item';

export const ContextLayoutItem = React.createContext({} as ItemNode);
export const ContextLayoutName = React.createContext('default');
export const ContextLayoutDepth = React.createContext(0);
