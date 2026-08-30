import React from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import type { WfsLayer } from '../../types/geoportal'
import {
	DEFAULT_WFS_FEATURE_LIMIT,
	WfsQueryError,
	fetchWfsCapabilities,
	fetchWfsFeatures,
	isNetworkFailure,
	type WfsFeatureType,
} from '../../utils/wfs'
import { wfsLayerFromGetFeature } from '../../persistence/wfsLayers'

export function WfsDialog({
	open,
	onOpenChange,
	onAdd,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onAdd: (layers: WfsLayer[]) => void
}): JSX.Element | null {
	const [url, setUrl] = React.useState('')
	const [discovering, setDiscovering] = React.useState(false)
	const [adding, setAdding] = React.useState(false)
	const [available, setAvailable] = React.useState<WfsFeatureType[]>([])
	const [selected, setSelected] = React.useState<Record<string, boolean>>({})
	const [wfsError, setWfsError] = React.useState<string | null>(null)
	const [wfsInfo, setWfsInfo] = React.useState<string | null>(null)
	const [queried, setQueried] = React.useState(false)
	const [layerMenuOpen, setLayerMenuOpen] = React.useState(false)
	const [negotiatedVersion, setNegotiatedVersion] = React.useState<string | undefined>(undefined)
	const requestIdRef = React.useRef(0)
	const layerMenuRef = React.useRef<HTMLDivElement>(null)

	function handleClearWfsSearch() {
		requestIdRef.current += 1
		setDiscovering(false)
		setAdding(false)
		setUrl('')
		setWfsError(null)
		setWfsInfo(null)
		setAvailable([])
		setSelected({})
		setQueried(false)
		setLayerMenuOpen(false)
		setNegotiatedVersion(undefined)
	}

	React.useEffect(() => {
		if (!wfsError) return
		const timeout = window.setTimeout(() => {
			setWfsError(null)
		}, 5000)
		return () => {
			window.clearTimeout(timeout)
		}
	}, [wfsError])

	React.useEffect(() => {
		if (!wfsInfo) return
		const timeout = window.setTimeout(() => {
			setWfsInfo(null)
		}, 5000)
		return () => {
			window.clearTimeout(timeout)
		}
	}, [wfsInfo])

	React.useEffect(() => {
		if (!open) handleClearWfsSearch()
	}, [open])

	React.useEffect(() => {
		if (!layerMenuOpen) return
		function onPointerDown(event: PointerEvent) {
			if (layerMenuRef.current?.contains(event.target as Node)) return
			setLayerMenuOpen(false)
		}
		function onKey(event: KeyboardEvent) {
			if (event.key !== 'Escape') return
			event.preventDefault()
			event.stopImmediatePropagation()
			setLayerMenuOpen(false)
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKey, true)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKey, true)
		}
	}, [layerMenuOpen])

	async function discover() {
		if (!url || discovering || adding) return
		const requestId = ++requestIdRef.current
		setDiscovering(true)
		setLayerMenuOpen(false)
		setWfsError(null)
		setWfsInfo(null)
		setAvailable([])
		setSelected({})
		setQueried(false)
		setNegotiatedVersion(undefined)
		try {
			const caps = await fetchWfsCapabilities(url)
			if (requestId !== requestIdRef.current) return
			setAvailable(caps.featureTypes)
			setNegotiatedVersion(caps.version)
			setSelected({})
			setQueried(true)
			setWfsError(null)
		} catch (err) {
			if (requestId !== requestIdRef.current) return
			console.error(err)
			setAvailable([])
			setSelected({})
			setQueried(false)
			setNegotiatedVersion(undefined)
			if (err instanceof WfsQueryError) {
				setWfsError(err.message)
			} else if (isNetworkFailure(err)) {
				setWfsError(
					'No se pudo conectar con el servicio WFS. Verificá la URL, la disponibilidad del servidor o la configuración CORS.',
				)
			} else {
				setWfsError('No se pudo consultar el servicio WFS.')
			}
		} finally {
			if (requestId === requestIdRef.current) setDiscovering(false)
		}
	}

	async function addSelected() {
		const types = available.filter((item) => selected[item.name])
		if (!url || types.length === 0 || adding || discovering) return
		const requestId = ++requestIdRef.current
		setAdding(true)
		setLayerMenuOpen(false)
		setWfsError(null)
		setWfsInfo(null)
		try {
			const results = await Promise.allSettled(
				types.map((item) =>
					fetchWfsFeatures({
						serviceUrl: url,
						typeName: item.name,
						version: negotiatedVersion,
					}).then((result) => ({ item, result })),
				),
			)
			if (requestId !== requestIdRef.current) return

			const layers: WfsLayer[] = []
			const errors: string[] = []
			const truncatedNames: string[] = []

			for (const settled of results) {
				if (settled.status === 'fulfilled') {
					const { item, result } = settled.value
					if (result.truncated) truncatedNames.push(item.title || item.name)
					layers.push(
						wfsLayerFromGetFeature({
							serviceUrl: url,
							typeName: item.name,
							title: item.title || item.name,
							version: negotiatedVersion,
							collection: result.collection,
							truncated: result.truncated,
						}),
					)
				} else {
					const reason = settled.reason
					if (reason instanceof WfsQueryError) {
						errors.push(reason.message)
					} else if (isNetworkFailure(reason)) {
						errors.push(
							'No se pudo conectar con el servicio WFS. Verificá la URL, la disponibilidad del servidor o la configuración CORS.',
						)
					} else {
						errors.push('No se pudo obtener una o más capas WFS.')
					}
				}
			}

			if (layers.length > 0) {
				onAdd(layers)
				const added = new Set(layers.map((layer) => layer.wfsTypeName))
				setSelected((current) => {
					const next = { ...current }
					for (const name of added) next[name] = false
					return next
				})
			}

			if (errors.length > 0) {
				setWfsError(errors.join(' '))
				return
			}

			if (truncatedNames.length > 0) {
				const names = truncatedNames.join(', ')
				setWfsInfo(
					`Se cargaron las primeras ${DEFAULT_WFS_FEATURE_LIMIT} entidades de ${
						truncatedNames.length === 1 ? 'la capa' : 'las capas'
					} ${names}.`,
				)
				return
			}

			onOpenChange(false)
		} catch (err) {
			if (requestId !== requestIdRef.current) return
			console.error(err)
			if (err instanceof WfsQueryError) {
				setWfsError(err.message)
			} else if (isNetworkFailure(err)) {
				setWfsError(
					'No se pudo conectar con el servicio WFS. Verificá la URL, la disponibilidad del servidor o la configuración CORS.',
				)
			} else {
				setWfsError('No se pudieron cargar las capas WFS.')
			}
		} finally {
			if (requestId === requestIdRef.current) setAdding(false)
		}
	}

	const selectedCount = available.filter((item) => selected[item.name]).length
	const busy = discovering || adding
	const canClear = url.trim() !== '' || available.length > 0 || queried || wfsError != null || wfsInfo != null
	const hasLayers = available.length > 0
	const emptyInfo =
		!busy && !wfsError && !wfsInfo && queried && !hasLayers
			? 'El servicio respondió correctamente, pero no contiene FeatureTypes disponibles para seleccionar.'
			: null
	const slotMessage = discovering
		? { kind: 'loading' as const, text: 'Consultando servicio WFS...' }
		: adding
			? { kind: 'loading' as const, text: 'Cargando capas WFS...' }
			: wfsError
				? { kind: 'error' as const, text: wfsError }
				: wfsInfo
					? { kind: 'info' as const, text: wfsInfo }
					: emptyInfo
						? { kind: 'info' as const, text: emptyInfo }
						: null

	return (
		<Dialog open={open} onOpenChange={onOpenChange} className="relative w-full max-w-2xl overflow-visible p-4">
			<DialogHeader>
				<DialogTitle>Agregar WFS</DialogTitle>
				<DialogDescription>
					Busque FeatureTypes disponibles desde un servicio WFS y agréguelos al mapa.
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-3">
				<form
					className="flex items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						void discover()
					}}
				>
					<Input
						className="min-w-0 flex-1"
						placeholder="URL del servicio WFS"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={busy}
					/>
					{canClear && (
						<Button
							type="button"
							variant="outline"
							size="icon"
							title="Limpiar"
							aria-label="Limpiar búsqueda WFS"
							disabled={busy}
							onClick={handleClearWfsSearch}
						>
							<X className="h-4 w-4" />
						</Button>
					)}
					<Button
						type="submit"
						size="icon"
						title="Buscar FeatureTypes WFS"
						aria-label="Buscar FeatureTypes WFS"
						disabled={!url || busy}
					>
						<Search className="h-4 w-4" />
					</Button>
				</form>
				<div className="h-5 overflow-hidden">
					{slotMessage && (
						<div
							role={slotMessage.kind === 'error' ? 'alert' : undefined}
							className={
								slotMessage.kind === 'error'
									? 'h-full overflow-y-auto px-2 py-1 text-xs leading-4 text-destructive'
									: 'h-full overflow-y-auto px-1 py-1 text-xs leading-4 text-muted-foreground'
							}
						>
							{slotMessage.text}
						</div>
					)}
				</div>
				<div>
					<div className="mb-2 text-sm">FeatureTypes</div>
					<div className="relative" ref={layerMenuRef}>
						<button
							type="button"
							disabled={!hasLayers || busy}
							aria-expanded={layerMenuOpen}
							aria-haspopup="listbox"
							className="control flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm disabled:pointer-events-none disabled:opacity-50"
							onClick={() => setLayerMenuOpen((openMenu) => !openMenu)}
						>
							<span>Seleccionar capas ({selectedCount})</span>
							<ChevronDown className={`h-4 w-4 shrink-0 opacity-70 ${layerMenuOpen ? 'rotate-180' : ''}`} />
						</button>
						{layerMenuOpen && hasLayers && (
							<div
								role="listbox"
								aria-multiselectable="true"
								className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
							>
								{available.map((featureType) => (
									<label
										key={featureType.name}
										className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
									>
										<input
											type="checkbox"
											className="mt-0.5"
											checked={!!selected[featureType.name]}
											onChange={(event) =>
												setSelected((current) => ({
													...current,
													[featureType.name]: event.target.checked,
												}))
											}
										/>
										<span className="min-w-0 break-words" title={featureType.name}>
											{featureType.title}
										</span>
									</label>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
			<DialogFooter>
				<Button variant="secondary" onClick={() => onOpenChange(false)} disabled={adding}>
					Cancelar
				</Button>
				<Button onClick={() => void addSelected()} disabled={selectedCount === 0 || busy}>
					Agregar
				</Button>
			</DialogFooter>
		</Dialog>
	)
}
