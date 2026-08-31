import React, {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react'
import {
	BREAKPOINTS,
	getInitialResponsiveMode,
	modeFromWidth,
	type ResponsiveMode,
} from '../config/breakpoints'

export type ResponsiveState = {
	mode: ResponsiveMode
	isMobile: boolean
	isTablet: boolean
	isDesktop: boolean
}

const ResponsiveContext = createContext<ResponsiveState | null>(null)

function readMode(): ResponsiveMode {
	return modeFromWidth(window.innerWidth)
}

export function ResponsiveProvider({
	children,
}: {
	children: React.ReactNode
}): JSX.Element {
	const [mode, setMode] = useState<ResponsiveMode>(getInitialResponsiveMode)

	useEffect(() => {
		const mqTablet = window.matchMedia(`(min-width: ${BREAKPOINTS.tablet}px)`)
		const mqDesktop = window.matchMedia(`(min-width: ${BREAKPOINTS.desktop}px)`)

		const update = () => {
			setMode(readMode())
		}

		mqTablet.addEventListener('change', update)
		mqDesktop.addEventListener('change', update)
		window.addEventListener('orientationchange', update)
		update()

		return () => {
			mqTablet.removeEventListener('change', update)
			mqDesktop.removeEventListener('change', update)
			window.removeEventListener('orientationchange', update)
		}
	}, [])

	const value = useMemo<ResponsiveState>(
		() => ({
			mode,
			isMobile: mode === 'mobile',
			isTablet: mode === 'tablet',
			isDesktop: mode === 'desktop',
		}),
		[mode],
	)

	return (
		<ResponsiveContext.Provider value={value}>
			{children}
		</ResponsiveContext.Provider>
	)
}

export function useResponsive(): ResponsiveState {
	const ctx = useContext(ResponsiveContext)
	if (!ctx) {
		throw new Error('useResponsive must be used within ResponsiveProvider')
	}
	return ctx
}
