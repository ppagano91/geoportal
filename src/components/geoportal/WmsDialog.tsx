import React from 'react'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ScrollArea } from '../ui/ScrollArea'

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
	const requestIdRef = React.useRef(0)

	async function discover() {
		if (!url || discovering) return
		const requestId = ++requestIdRef.current
		setDiscovering(true)
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
		setUrl('')
		setAvailable([])
		setSelected({})
		setWmsError(null)
		setQueried(false)
		onOpenChange(false)
	}

	const selectedCount = available.filter(a => selected[a.name]).length

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader>
				<DialogTitle>Añadir WMS</DialogTitle>
				<DialogDescription>Busque capas disponibles desde un servicio WMS y agréguelas al mapa.</DialogDescription>
			</DialogHeader>
			<div className="grid gap-3">
				<div>
					<Input placeholder="URL del servicio WMS" value={url} onChange={(e) => setUrl(e.target.value)} />
				</div>
				<div className="flex gap-2">
					<Button onClick={discover} disabled={!url || discovering}>{discovering ? 'Buscando…' : 'Buscar capas'}</Button>
				</div>
				{discovering && (
					<p className="text-sm text-muted-foreground">Consultando servicio WMS...</p>
				)}
				{wmsError && (
					<div
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					>
						{wmsError}
					</div>
				)}
				{!wmsError && !discovering && queried && available.length === 0 && (
					<p className="text-sm text-muted-foreground">
						El servicio respondió correctamente, pero no contiene capas WMS disponibles para seleccionar.
					</p>
				)}
				{available.length > 0 && (
					<div>
						<div className="text-sm mb-2">Capas disponibles</div>
						<ScrollArea className="max-h-[60vh] border rounded p-2">
							<div className="flex flex-col gap-2">
								{available.map(a => (
									<label key={a.name} className="flex items-start gap-2 text-sm py-1">
										<input
											type="checkbox"
											checked={!!selected[a.name]}
											onChange={(e) => setSelected(s => ({ ...s, [a.name]: e.target.checked }))}
										/>
										<span className="break-words whitespace-normal" title={a.title}>{a.title}</span>
									</label>
								))}
							</div>
						</ScrollArea>
					</div>
				)}
			</div>
			<DialogFooter>
				<Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
				<Button onClick={addSelected} disabled={selectedCount === 0}>Agregar seleccionadas</Button>
			</DialogFooter>
		</Dialog>
	)
}
