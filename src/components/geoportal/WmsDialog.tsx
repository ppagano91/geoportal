import React from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

type WmsLayerOption = { name: string; title: string }

class WmsQueryError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'WmsQueryError'
	}
}

function directChildText(el: Element, localName: string): string {
	for (const child of Array.from(el.children)) {
		if (child.localName === localName) {
			return (child.textContent ?? '').trim()
		}
	}
	return ''
}

function collectSelectableLayers(el: Element, byName: Map<string, WmsLayerOption>): void {
	if (el.localName === 'Layer') {
		const name = directChildText(el, 'Name')
		if (name) {
			if (!byName.has(name)) {
				byName.set(name, { name, title: directChildText(el, 'Title') || name })
			}
		}
	}
	for (const child of Array.from(el.children)) {
		collectSelectableLayers(child, byName)
	}
}

function hasParserError(xml: Document): boolean {
	if (xml.documentElement?.localName === 'parsererror') return true
	return xml.getElementsByTagName('parsererror').length > 0
}

function firstByLocalName(xml: Document, localName: string): Element | undefined {
	const all = xml.getElementsByTagName('*')
	for (const el of Array.from(all)) {
		if (el.localName === localName) return el
	}
	return undefined
}

function sanitizeExceptionMessage(raw: string): string {
	const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
	if (text.length > 240) return `${text.slice(0, 237)}...`
	return text
}

function extractOgcExceptionMessage(xml: Document): string | null {
	const rootName = xml.documentElement?.localName ?? ''
	const isExceptionDocument =
		rootName === 'ServiceExceptionReport' ||
		rootName === 'ExceptionReport' ||
		firstByLocalName(xml, 'ServiceException') != null ||
		firstByLocalName(xml, 'ExceptionReport') != null

	if (!isExceptionDocument) return null

	const raw =
		firstByLocalName(xml, 'ServiceException')?.textContent ??
		firstByLocalName(xml, 'ExceptionText')?.textContent ??
		firstByLocalName(xml, 'Exception')?.getAttribute('exceptionCode') ??
		''
	const message = sanitizeExceptionMessage(raw)
	if (message) return `El servicio WMS respondió con un error: ${message}`
	return 'El servicio WMS respondió con un error.'
}

function isNetworkFailure(err: unknown): boolean {
	if (!(err instanceof Error)) return false
	if (err.name === 'TypeError' || err.name === 'NetworkError') return true
	const msg = err.message.toLowerCase()
	return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors')
}

function parseCapabilitiesXml(txt: string): WmsLayerOption[] {
	const xml = new window.DOMParser().parseFromString(txt, 'text/xml')
	if (hasParserError(xml) || !xml.documentElement) {
		throw new WmsQueryError('La respuesta del servidor no es un documento WMS GetCapabilities válido.')
	}

	const ogcError = extractOgcExceptionMessage(xml)
	if (ogcError) throw new WmsQueryError(ogcError)

	const byName = new Map<string, WmsLayerOption>()
	collectSelectableLayers(xml.documentElement, byName)
	return Array.from(byName.values())
}

export function WmsDialog({
	open,
	onOpenChange,
	onAdd
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onAdd: (url: string, layerNames: string[]) => void
}): JSX.Element | null {
	const [url, setUrl] = React.useState('')
	const [discovering, setDiscovering] = React.useState(false)
	const [available, setAvailable] = React.useState<WmsLayerOption[]>([])
	const [selected, setSelected] = React.useState<Record<string, boolean>>({})
	const [wmsError, setWmsError] = React.useState<string | null>(null)
	const [queried, setQueried] = React.useState(false)
	const [layerMenuOpen, setLayerMenuOpen] = React.useState(false)
	const requestIdRef = React.useRef(0)
	const layerMenuRef = React.useRef<HTMLDivElement>(null)

	function handleClearWmsSearch() {
		requestIdRef.current += 1
		setDiscovering(false)
		setUrl('')
		setWmsError(null)
		setAvailable([])
		setSelected({})
		setQueried(false)
		setLayerMenuOpen(false)
	}

	React.useEffect(() => {
		if (!wmsError) return
		const timeout = window.setTimeout(() => {
			setWmsError(null)
		}, 5000)
		return () => {
			window.clearTimeout(timeout)
		}
	}, [wmsError])

	React.useEffect(() => {
		if (!open) handleClearWmsSearch()
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
		if (!url || discovering) return
		const requestId = ++requestIdRef.current
		setDiscovering(true)
		setLayerMenuOpen(false)
		setWmsError(null)
		setAvailable([])
		setSelected({})
		setQueried(false)
		try {
			const sep = url.includes('?') ? '&' : '?'
			const capsUrl = `${url}${sep}service=WMS&request=GetCapabilities`
			const res = await fetch(capsUrl)
			if (requestId !== requestIdRef.current) return
			if (!res.ok) {
				throw new WmsQueryError(
					`No se pudo consultar el servicio WMS. El servidor respondió con HTTP ${res.status}.`
				)
			}
			const txt = await res.text()
			if (requestId !== requestIdRef.current) return
			const items = parseCapabilitiesXml(txt)
			setAvailable(items)
			setSelected({})
			setQueried(true)
			setWmsError(null)
		} catch (err) {
			if (requestId !== requestIdRef.current) return
			console.error(err)
			setAvailable([])
			setSelected({})
			setQueried(false)
			if (err instanceof WmsQueryError) {
				setWmsError(err.message)
			} else if (isNetworkFailure(err)) {
				setWmsError(
					'No se pudo conectar con el servicio WMS. Verificá la URL, la disponibilidad del servidor o la configuración CORS.'
				)
			} else {
				setWmsError('No se pudo consultar el servicio WMS.')
			}
		} finally {
			if (requestId === requestIdRef.current) setDiscovering(false)
		}
	}

	function addSelected() {
		const names = available.filter(a => selected[a.name]).map(a => a.name)
		if (!url || names.length === 0) return
		onAdd(url, names)
		onOpenChange(false)
	}

	const selectedCount = available.filter(a => selected[a.name]).length
	const canClear =
		url.trim() !== '' || available.length > 0 || queried || wmsError != null
	const hasLayers = available.length > 0
	const emptyInfo =
		!discovering && !wmsError && queried && !hasLayers
			? 'El servicio respondió correctamente, pero no contiene capas WMS disponibles para seleccionar.'
			: null
	const slotMessage = discovering
		? { kind: 'loading' as const, text: 'Consultando servicio WMS...' }
		: wmsError
			? { kind: 'error' as const, text: wmsError }
			: emptyInfo
				? { kind: 'info' as const, text: emptyInfo }
				: null

	return (
		<Dialog open={open} onOpenChange={onOpenChange} className="relative w-full max-w-2xl overflow-visible p-4">
			<DialogHeader>
				<DialogTitle>Añadir WMS</DialogTitle>
				<DialogDescription>Busque capas disponibles desde un servicio WMS y agréguelas al mapa.</DialogDescription>
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
						placeholder="URL del servicio WMS"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
					{canClear && (
						<Button
							type="button"
							variant="outline"
							size="icon"
							title="Limpiar"
							aria-label="Limpiar búsqueda WMS"
							disabled={discovering}
							onClick={handleClearWmsSearch}
						>
							<X className="h-4 w-4" />
						</Button>
					)}
					<Button
						type="submit"
						size="icon"
						title="Buscar capas WMS"
						aria-label="Buscar capas WMS"
						disabled={!url || discovering}
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
									// ? 'h-full overflow-y-auto rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs leading-4 text-destructive'
									: 'h-full overflow-y-auto px-1 py-1 text-xs leading-4 text-muted-foreground'
							}
						>
							{slotMessage.text}
						</div>
					)}
				</div>
				<div>
					<div className="mb-2 text-sm">Capas</div>
					<div className="relative" ref={layerMenuRef}>
						<button
							type="button"
							disabled={!hasLayers}
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
								{available.map((layer) => (
									<label
										key={layer.name}
										className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
									>
										<input
											type="checkbox"
											className="mt-0.5"
											checked={!!selected[layer.name]}
											onChange={(event) =>
												setSelected((current) => ({
													...current,
													[layer.name]: event.target.checked,
												}))
											}
										/>
										<span className="min-w-0 break-words" title={layer.name}>
											{layer.title}
										</span>
									</label>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
			<DialogFooter>
				<Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
				<Button onClick={addSelected} disabled={selectedCount === 0}>Agregar seleccionadas</Button>
			</DialogFooter>
		</Dialog>
	)
}
