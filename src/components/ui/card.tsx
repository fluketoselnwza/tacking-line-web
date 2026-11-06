import * as React from 'react';
import { cn } from '@/lib/utils';
export function Card({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)]',className)} {...props}/>;}
export function CardHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('flex items-start justify-between gap-3 p-5 pb-2',className)} {...props}/>;}
export function CardTitle({className,...props}:React.HTMLAttributes<HTMLHeadingElement>){return <h2 className={cn('text-sm font-semibold text-slate-800',className)} {...props}/>;}
export function CardContent({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('p-5 pt-3',className)} {...props}/>;}
