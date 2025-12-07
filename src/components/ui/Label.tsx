import React from 'react'
import { cn } from '../../utils/cn'

export function Label({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
	return (
		<label htmlFor={htmlFor} className={cn('text-sm font-medium text-foreground/90', className)}>
			{children}
		</label>
	)
}


