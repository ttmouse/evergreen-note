/* eslint-disable react/destructuring-assignment */
/* eslint-disable prettier/prettier */
import React from "react";
import { UnitMode } from "../interfaces/unit";
import { ContextUnitMode } from "./UnitView";

export const ModeClickFirst = (props: any) => {
  return (
    <ContextUnitMode.Provider value={ UnitMode.ClickFirst }>
      { props.children }
    </ContextUnitMode.Provider>
  )
}

export const ModeEditFirst = (props: any) => {
  return (
    <ContextUnitMode.Provider value={ UnitMode.EditFirst }>
      { props.children }
    </ContextUnitMode.Provider>
  )
}

export const ModeReadFirst = (props: any) => {
  return (
    <ContextUnitMode.Provider value={ UnitMode.ReadFirst }>
      { props.children }
    </ContextUnitMode.Provider>
  )
}

export const ModeReadOnly = (props: any) => {
  return (
    <ContextUnitMode.Provider value={ UnitMode.ReadOnly }>
      { props.children }
    </ContextUnitMode.Provider>
  )
}