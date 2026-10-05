/* eslint-disable no-console */
import React from 'react';
import { ControlMethod, StateAction } from './useReducerUnit';

const dispatchCache: any = {};
export const getDispatch = (id: string): ControlMethod => {
  console.assert(dispatchCache[id], `dispatchCache[${id}] is not found`);
  return dispatchCache[id];
};

const commandCache: any = {};
export const getControl = (id: string): ControlMethod => {
  console.assert(commandCache[id], `commandCache[${id}] is not found`);
  return commandCache[id];
};

/**
 * 将 React.useReducer() 的第二个参数 dispatch 放入缓存
 * 这样我们可以在全局范围内获取 dispatch 函数, 并调用
 * @param params
 * @returns
 */
export const useDispatchCache = (params: {
  id: string;
  control: ControlMethod[];
  dispatch: React.Dispatch<StateAction>;
}) => {
  React.useEffect(() => {
    return () => {
      if (params.id) {
        delete commandCache[params.id];
        delete dispatchCache[params.id];
      }
    };
  }, [params.id]);

  if (!params.id) {
    return;
  }

  commandCache[params.id] = params.control;
  dispatchCache[params.id] = params.dispatch;
};
