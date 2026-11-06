import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs:ClassValue[]){return twMerge(clsx(inputs));}
export const number=(v:string|number|null|undefined,digits=2)=>v===null||v===undefined?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(Number(v));
