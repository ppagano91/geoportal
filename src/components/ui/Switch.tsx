import React from 'react'
import { cn } from '../../utils/cn'

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
	checked?: boolean
	onCheckedChange?: (checked: boolean) => void
}

export function Switch({ className, checked, onCheckedChange, ...props }: SwitchProps): JSX.Element {
	return (
		<button
			role="switch"
			aria-checked={checked}
			onClick={() => onCheckedChange?.(!checked)}
			className={cn(
				'relative inline-flex h-6 w-11 items-center rounded-full transition',
				checked ? 'bg-primary' : 'bg-muted',
				'focus:outline-none focus:ring-2 focus:ring-ring',
				className
			)}
			{...props}
		>
			<span
				className={cn(
					'inline-block h-5 w-5 transform rounded-full bg-background shadow transition',
					checked ? 'translate-x-6' : 'translate-x-1'
				)}
			/>
		</button>
	)
}


