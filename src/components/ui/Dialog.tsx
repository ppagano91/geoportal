import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface DialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	children: React.ReactNode
	fullScreen?: boolean
	className?: string
	showClose?: boolean
}

export function Dialog({
	open,
	onOpenChange,
	children,
	fullScreen,
	className,
	showClose = false,
}: DialogProps): JSX.Element | null {
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onOpenChange(false)
		}
		if (open) document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, onOpenChange])

	if (!open) return null

	const closeButton = showClose ? (
		<button
			type="button"
			aria-label="Cerrar"
			title="Cerrar"
			className="absolute right-2.5 top-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			onClick={() => onOpenChange(false)}
		>
			<X className="h-4 w-4" />
		</button>
	) : null

	return (
		<div className="fixed inset-0 z-[1200]">
			<div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
			{fullScreen ? (
				<div className="absolute inset-0 p-0">
					<div className={cn('surface relative flex h-full w-full flex-col overflow-auto p-4', className)}>
						{closeButton}
						{children}
					</div>
				</div>
			) : (
				<div className="absolute inset-0 flex items-center justify-center p-4">
					<div
						role="dialog"
						aria-modal="true"
						className={cn(
							'surface relative flex min-h-0 flex-col',
							className ?? 'w-full max-w-2xl p-4',
						)}
					>
						{closeButton}
						{children}
					</div>
				</div>
			)}
		</div>
	)
}

export function DialogHeader({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return <div className={className ?? 'mb-3'}>{children}</div>
}
export function DialogTitle({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return <h3 className={cn('text-lg font-semibold', className)}>{children}</h3>
}
export function DialogDescription({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}
export function DialogFooter({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return (
		<div className={className ?? 'mt-4 flex items-center justify-end gap-2'}>
			{children}
		</div>
	)
}


