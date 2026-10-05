import { FormikValues, useFormik } from 'formik';
import React from 'react';

export const ContextFormValues = React.createContext<FormikValues>({});
export const ContextFormik = React.createContext<ReturnType<typeof useFormik>>({} as any);
export const ContextOnChangeElement = React.createContext<((k: string, v: any) => void) | null>(null);
