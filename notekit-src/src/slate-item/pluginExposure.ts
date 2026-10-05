import { setPubState } from './hooks/usePubState'
import { Transforms } from './slate.inc'
import { after, before, cover } from './engine/helper'
import { Item } from '.'

export const exposure = (e: any) => {
  if (e) {
    e.setPubState = setPubState
    e.Transforms = Transforms
    e.cover = cover;
    e.before = before;
    e.after = after;
    e.Item = Item;
  }
}