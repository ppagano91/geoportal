import React from 'react'
import { cn } from '../../utils/cn'

export interface SelectOption<T extends string = string> {
	label: string
	value: T
}

export interface SelectProps<T extends string = string> {
	value: T
	onValueChange: (value: T) => void
	options: SelectOption<T>[]
	className?: string
}

export function Select<T extends string = string>({ value, onValueChange, options, className }: SelectProps<T>) {
	return (
		<select
			value={value}
			onChange={(e) => onValueChange(e.target.value as T)}
			className={cn('h-9 w-full rounded-md border bg-background px-3 py-1 text-sm', className)}
		>
			{options.map((opt) => (
				<option key={opt.value} value={opt.value}>
					{opt.label}
				</option>
			))}
		</select>
	)
}



