import { makeAutoObservable } from 'mobx';
import { KyString } from '../../interfaces/unit';
import { isPublic } from '../DbDisk/helper';

export class RecentStore {
  /**
   * 显示条数
   */
  displaySize = 8;

  /**
   * 最大保存记录数
   */
  saveSize = 30;

  /**
   * 最近浏览的节点
   */
  list: KyString[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  add(ky: KyString) {
    this.list = this.list.filter((v) => v !== ky);
    this.list.unshift(ky);
    if (this.list.length > this.saveSize) {
      this.list.pop();
    }
    this.save();
  }

  save() {
    localStorage.setItem(`recent${isPublic()?"-share":""}`, JSON.stringify(this.list));
  }

  load() {
    const list = localStorage.getItem(`recent${isPublic()?"-share":""}`);
    if (list) {
      this.list = JSON.parse(list);
    }
  }
}
