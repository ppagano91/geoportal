import React, { useContext } from 'react'
import { GeoPortalContext } from '../../shell/GeoPortalApp'
import { Globe, Moon, SunMedium } from 'lucide-react'
import { cn } from '../../utils/cn'

export function BaseMapControl(): JSX.Element {
	const ctx = useContext(GeoPortalContext)!
	const { state, dispatch } = ctx
	const items: Array<{ key: typeof state.baseMap; label: string; icon: React.ReactNode }> = [
		{ key: 'dark', label: 'Dark Matter', icon: <Moon className="h-4 w-4" /> },
		{ key: 'light', label: 'Positron', icon: <SunMedium className="h-4 w-4" /> },
		{ key: 'voyager', label: 'Voyager', icon: <Globe className="h-4 w-4" /> }
	]
	return (
		<div className="surface p-2 flex gap-2 items-center">
			{items.map(it => (
				<button
					key={it.key}
					className={cn(
						'control h-9 px-3 text-sm',
						state.baseMap === it.key ? 'bg-primary text-primary-foreground' : ''
					)}
					title={it.label}
					onClick={() => dispatch({ type: 'setBaseMap', baseMap: it.key })}
				>
					{it.icon}
					<span className="ml-2 hidden sm:inline">{it.label}</span>
				</button>
			))}
		</div>
	)
}


