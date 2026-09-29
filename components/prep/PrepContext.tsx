"use client";
import { createContext, useContext } from 'react';
export const PrepOwnerContext=createContext('guest');
export const usePrepOwner=()=>useContext(PrepOwnerContext);
