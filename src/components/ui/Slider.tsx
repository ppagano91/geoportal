import React from 'react'

export interface SliderProps {
	value: number
	onValueChange: (value: number) => void
	min?: number
	max?: number
	step?: number
}

export function Slider({ value, onValueChange, min = 0, max = 100, step = 1 }: SliderProps): JSX.Element {
	return (
		<input
			type="range"
			min={min}
			max={max}
			step={step}
			value={value}
			onChange={(e) => onValueChange(parseFloat(e.target.value))}
			className="w-full accent-primary"
		/>
	)
}



