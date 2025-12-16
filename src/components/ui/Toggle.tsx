import React from 'react'
import { cn } from '../../utils/cn'

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	pressed?: boolean
}

export function Toggle({ pressed, className, ...props }: ToggleProps): JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			className={cn('control h-9 px-3 text-sm', pressed ? 'bg-primary text-primary-foreground' : '', className)}
			{...props}
		/>
	)
}



