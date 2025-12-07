import React from 'react'
import { cn } from '../../utils/cn'

export function ScrollArea({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn('overflow-auto', className)}>{children}</div>
}


