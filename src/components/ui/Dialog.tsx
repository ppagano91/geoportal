import React, { useEffect } from 'react'
import { cn } from '../../utils/cn'

export interface DialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	children: React.ReactNode
	fullScreen?: boolean
}

export function Dialog({ open, onOpenChange, children, fullScreen }: DialogProps): JSX.Element | null {
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onOpenChange(false)
		}
		if (open) document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, onOpenChange])

	if (!open) return null
	return (
		<div className="fixed inset-0 z-[1200]">
			<div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
			{fullScreen ? (
				<div className="absolute inset-0 p-0">
					<div className={cn('surface w-full h-full p-4 overflow-auto')}>{children}</div>
				</div>
			) : (
				<div className="absolute inset-0 flex items-center justify-center p-4">
					<div className={cn('surface w-full max-w-2xl p-4')}>{children}</div>
				</div>
			)}
		</div>
	)
}

export function DialogHeader({ children }: { children?: React.ReactNode }) {
	return <div className="mb-3">{children}</div>
}
export function DialogTitle({ children }: { children?: React.ReactNode }) {
	return <h3 className="text-lg font-semibold">{children}</h3>
}
export function DialogDescription({ children }: { children?: React.ReactNode }) {
	return <p className="text-sm text-muted-foreground">{children}</p>
}
export function DialogFooter({ children }: { children?: React.ReactNode }) {
	return <div className="mt-4 flex items-center justify-end gap-2">{children}</div>
}


