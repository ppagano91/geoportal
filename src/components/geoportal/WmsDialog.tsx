import React from 'react'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ScrollArea } from '../ui/ScrollArea'
import type { Layer } from '../../types/geoportal'

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
	const [available, setAvailable] = React.useState<Array<{ name: string; title: string }>>([])
	const [selected, setSelected] = React.useState<Record<string, boolean>>({})

	async function discover() {
		if (!url) return
		setDiscovering(true)
		try {
			const sep = url.includes('?') ? '&' : '?'
			const capsUrl = `${url}${sep}service=WMS&request=GetCapabilities`
			const res = await fetch(capsUrl)
			const txt = await res.text()
			const xml = new window.DOMParser().parseFromString(txt, 'text/xml')
			const layerEls = Array.from(xml.getElementsByTagName('Layer')).filter(el => el.getElementsByTagName('Name')[0]?.textContent)
			const items: Array<{ name: string; title: string }> = []
			for (const el of layerEls) {
				const name = el.getElementsByTagName('Name')[0]?.textContent ?? ''
				const title = el.getElementsByTagName('Title')[0]?.textContent ?? name
				if (name) items.push({ name, title })
			}
			setAvailable(items)
			setSelected({})
		} catch {
			setAvailable([])
		} finally {
			setDiscovering(false)
		}
	}

	function addSelected() {
		const names = available.filter(a => selected[a.name]).map(a => a.name)
		if (!url || names.length === 0) return
		onAdd(url, names)
		setUrl(''); setAvailable([]); setSelected({})
		onOpenChange(false)
	}

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
				{available.length > 0 && (
					<div>
						<div className="text-sm mb-2">Capas disponibles</div>
						<ScrollArea className="max-h-[60vh] border rounded p-2">
							<div className="flex flex-col gap-2">
								{available.map(a => (
									<label key={a.name} className="flex items-start gap-2 text-sm py-1">
										<input type="checkbox" checked={!!selected[a.name]} onChange={(e) => setSelected(s => ({ ...s, [a.name]: e.target.checked }))} />
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
				<Button onClick={addSelected} disabled={available.filter(a => selected[a.name]).length === 0}>Agregar seleccionadas</Button>
			</DialogFooter>
		</Dialog>
	)
}


