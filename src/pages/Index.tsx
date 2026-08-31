import React from 'react'
import { GeoPortalApp } from '../shell/GeoPortalApp'
import { ResponsiveProvider } from '../hooks/useResponsive'

export function IndexPage(): JSX.Element {
	return (
		<ResponsiveProvider>
			<GeoPortalApp />
		</ResponsiveProvider>
	)
}



