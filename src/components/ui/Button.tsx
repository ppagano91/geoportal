import React from 'react'
import { cn } from '../../utils/cn'

type Variant = 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant
	size?: Size
}

const variantClass: Record<Variant, string> = {
	default: 'bg-primary text-primary-foreground hover:opacity-90',
	secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
	ghost: 'bg-transparent hover:bg-muted',
	outline: 'border bg-transparent hover:bg-muted',
	destructive: 'bg-destructive text-destructive-foreground hover:opacity-90'
}

const sizeClass: Record<Size, string> = {
	sm: 'h-8 px-3 text-sm',
	md: 'h-9 px-4',
	lg: 'h-11 px-5 text-base',
	icon: 'h-9 w-9'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ className, variant = 'default', size = 'md', ...props },
	ref
) {
	return (
		<button
			ref={ref}
			className={cn(
				'control select-none font-medium focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:pointer-events-none',
				variantClass[variant],
				sizeClass[size],
				className
			)}
			{...props}
		/>
	)
})


