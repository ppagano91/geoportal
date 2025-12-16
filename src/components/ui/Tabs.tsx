import React from 'react'
import { cn } from '../../utils/cn'

export interface TabsProps {
	value: string
	onValueChange: (value: string) => void
	children: React.ReactNode
}

export function Tabs({ value, onValueChange, children }: TabsProps) {
	return <div data-value={value}>{children}</div>
}

export function TabsList({ children }: { children: React.ReactNode }) {
	return <div className="flex gap-1 mb-3">{children}</div>
}

export function TabsTrigger({ value, current, onSelect, children }: { value: string; current: string; onSelect: (v: string) => void; children: React.ReactNode }) {
	const active = value === current
	return (
		<button
			type="button"
			onClick={() => onSelect(value)}
			className={cn(
				'px-3 py-1.5 rounded-md text-sm border',
				active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
			)}
		>
			{children}
		</button>
	)
}

export function TabsContent({ value, current, children }: { value: string; current: string; children: React.ReactNode }) {
	if (value !== current) return null
	return <div>{children}</div>
}



