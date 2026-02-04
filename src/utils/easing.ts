/**
 * Easing Functions
 *
 * 31 standard easing functions for animation. Pure math, no dependencies.
 */

export type EasingFn = (t: number) => number;

export function linear(t: number): number {
	return t;
}

// Quad
export function easeInQuad(t: number): number {
	return t * t;
}

export function easeOutQuad(t: number): number {
	return t * (2 - t);
}

export function easeInOutQuad(t: number): number {
	return t < 0.5
		? 2 * t * t
		: -1 + (4 - 2 * t) * t;
}

// Cubic
export function easeInCubic(t: number): number {
	return t * t * t;
}

export function easeOutCubic(t: number): number {
	const t1 = t - 1;
	return t1 * t1 * t1 + 1;
}

export function easeInOutCubic(t: number): number {
	return t < 0.5
		? 4 * t * t * t
		: 1 + (t - 1) * (2 * t - 2) * (2 * t - 2);
}

// Quart
export function easeInQuart(t: number): number {
	return t * t * t * t;
}

export function easeOutQuart(t: number): number {
	const t1 = t - 1;
	return 1 - t1 * t1 * t1 * t1;
}

export function easeInOutQuart(t: number): number {
	return t < 0.5
		? 8 * t * t * t * t
		: 1 - 8 * (t - 1) * (t - 1) * (t - 1) * (t - 1);
}

// Quint
export function easeInQuint(t: number): number {
	return t * t * t * t * t;
}

export function easeOutQuint(t: number): number {
	const t1 = t - 1;
	return 1 + t1 * t1 * t1 * t1 * t1;
}

export function easeInOutQuint(t: number): number {
	return t < 0.5
		? 16 * t * t * t * t * t
		: 1 + 16 * (t - 1) * (t - 1) * (t - 1) * (t - 1) * (t - 1);
}

// Sine
export function easeInSine(t: number): number {
	return 1 - Math.cos((t * Math.PI) / 2);
}

export function easeOutSine(t: number): number {
	return Math.sin((t * Math.PI) / 2);
}

export function easeInOutSine(t: number): number {
	return -(Math.cos(Math.PI * t) - 1) / 2;
}

// Expo
export function easeInExpo(t: number): number {
	return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
}

export function easeOutExpo(t: number): number {
	return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function easeInOutExpo(t: number): number {
	if (t === 0) return 0;
	if (t === 1) return 1;
	return t < 0.5
		? Math.pow(2, 20 * t - 10) / 2
		: (2 - Math.pow(2, -20 * t + 10)) / 2;
}

// Circ
export function easeInCirc(t: number): number {
	return 1 - Math.sqrt(1 - t * t);
}

export function easeOutCirc(t: number): number {
	const t1 = t - 1;
	return Math.sqrt(1 - t1 * t1);
}

export function easeInOutCirc(t: number): number {
	return t < 0.5
		? (1 - Math.sqrt(1 - 4 * t * t)) / 2
		: (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2;
}

// Back
const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;

export function easeInBack(t: number): number {
	return BACK_C3 * t * t * t - BACK_C1 * t * t;
}

export function easeOutBack(t: number): number {
	const t1 = t - 1;
	return 1 + BACK_C3 * t1 * t1 * t1 + BACK_C1 * t1 * t1;
}

export function easeInOutBack(t: number): number {
	return t < 0.5
		? ((2 * t) * (2 * t) * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
		: ((2 * t - 2) * (2 * t - 2) * ((BACK_C2 + 1) * (t * 2 - 2) + BACK_C2) + 2) / 2;
}

// Elastic
const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;

export function easeInElastic(t: number): number {
	if (t === 0) return 0;
	if (t === 1) return 1;
	return -Math.pow(2, 10 * t - 10) * Math.sin((10 * t - 10.75) * ELASTIC_C4);
}

export function easeOutElastic(t: number): number {
	if (t === 0) return 0;
	if (t === 1) return 1;
	return Math.pow(2, -10 * t) * Math.sin((10 * t - 0.75) * ELASTIC_C4) + 1;
}

export function easeInOutElastic(t: number): number {
	if (t === 0) return 0;
	if (t === 1) return 1;
	return t < 0.5
		? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
		: (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1;
}

// Bounce
export function easeOutBounce(t: number): number {
	const n1 = 7.5625;
	const d1 = 2.75;

	if (t < 1 / d1) {
		return n1 * t * t;
	} else if (t < 2 / d1) {
		const t1 = t - 1.5 / d1;
		return n1 * t1 * t1 + 0.75;
	} else if (t < 2.5 / d1) {
		const t1 = t - 2.25 / d1;
		return n1 * t1 * t1 + 0.9375;
	} else {
		const t1 = t - 2.625 / d1;
		return n1 * t1 * t1 + 0.984375;
	}
}

export function easeInBounce(t: number): number {
	return 1 - easeOutBounce(1 - t);
}

export function easeInOutBounce(t: number): number {
	return t < 0.5
		? (1 - easeOutBounce(1 - 2 * t)) / 2
		: (1 + easeOutBounce(2 * t - 1)) / 2;
}

/** Runtime lookup of all easing functions by name */
export const easings = {
	linear,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc,
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic,
	easeInBounce,
	easeOutBounce,
	easeInOutBounce,
} as const;
