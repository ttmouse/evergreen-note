import React from 'react';
import { IAddon, App, NewAddonParams } from '../../engine/App';

export function createRefPlusAddon({ app, $ }: NewAddonParams) {
  class RefPlus implements IAddon {
    app!: App;
    config = {};

    createComponent() {
      return () => {
        return <></>;
      };
    }

    addonRun() {
      // Initialization for this the addon RefPlus
    }
  }

  return { refPlus: new RefPlus() };
}
