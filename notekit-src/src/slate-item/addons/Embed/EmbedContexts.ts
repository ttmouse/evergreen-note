import React from 'react';
import { KyString } from '../..';

// Tell if an item is within a reference context,
// such as: search, block reference, block embed, etc.
export const ContextEditorReference = React.createContext(false);

// Tell if an item is within an block embed context,
// and give the embeded item's ky
export const ContextEditorEmbed = React.createContext<KyString | null>(null);
