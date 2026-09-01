export const BREAKPOINTS = {
	/** Inclusive lower bound for tablet. Mobile is anything below this. */
	tablet: 768,
	/** Inclusive lower bound for desktop. */
	desktop: 1024,
} as const

export type ResponsiveMode = 'mobile' | 'tablet' | 'desktop'

export type MobilePanel = 'layers' | 'wms' | 'wfs' | null

export const MOBILE_NAV_HEIGHT_CLASS = 'h-14'

export function modeFromWidth(width: number): ResponsiveMode {
	if (width < BREAKPOINTS.tablet) return 'mobile'
	if (width < BREAKPOINTS.desktop) return 'tablet'
	return 'desktop'
}

export function getInitialResponsiveMode(): ResponsiveMode {
	if (typeof window === 'undefined') return 'desktop'
	return modeFromWidth(window.innerWidth)
}
