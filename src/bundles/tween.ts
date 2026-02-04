/**
 * Tween Bundle for ECSpresso
 *
 * Declarative property animation within the ECS. Tween any numeric component
 * field over time with standard easing functions, sequences, and completion events.
 */

import { Bundle } from 'ecspresso';
import type { SystemPhase, ComponentsOfWorld, EventsOfWorld } from 'ecspresso';
import { linear, type EasingFn } from '../utils/easing';

// ==================== Event Types ====================

/**
 * Data structure published when a tween completes.
 * Use this type when defining tween completion events in your EventTypes interface.
 */
export interface TweenEventData {
	/** The entity ID the tween belongs to */
	entityId: number;
	/** Number of steps in the tween */
	stepCount: number;
}

/**
 * Extracts event names from EventTypes that have TweenEventData as their payload.
 * This ensures only compatible events can be used with tween.onComplete.
 * Uses `keyof EventTypes & string` to exclude number/symbol keys, ensuring the
 * result is always a string subtype and Tween<E> is assignable to Tween<Record<string, any>>.
 */
export type TweenEventName<EventTypes extends Record<string, any>> = {
	[K in keyof EventTypes & string]: EventTypes[K] extends TweenEventData ? K : never
}[keyof EventTypes & string];

// ==================== Component Types ====================

export interface TweenTarget {
	/** Component name on the entity */
	component: string;
	/** Pre-split field path (e.g., ['position', 'x']) */
	path: readonly string[];
	/** Starting value. null = resolve from current value on first tick */
	from: number | null;
	/** Target value */
	to: number;
}

export interface TweenStep {
	targets: TweenTarget[];
	duration: number;
	easing: EasingFn;
}

export interface Tween<EventTypes extends Record<string, any> = Record<string, any>> {
	steps: TweenStep[];
	currentStep: number;
	elapsed: number;
	loop: LoopMode;
	totalLoops: number;
	completedLoops: number;
	direction: 1 | -1;
	state: 'pending' | 'active' | 'complete';
	onComplete?: TweenEventName<EventTypes>;
	justFinished: boolean;
}

export type LoopMode = 'once' | 'loop' | 'yoyo';

/**
 * Component types provided by the tween bundle.
 */
export interface TweenComponentTypes<EventTypes extends Record<string, any> = Record<string, any>> {
	tween: Tween<EventTypes>;
}

// ==================== Bundle Options ====================

export interface TweenBundleOptions<G extends string = 'tweens'> {
	/** System group name (default: 'tweens') */
	systemGroup?: G;
	/** Priority for tween update system (default: 0) */
	priority?: number;
	/** Execution phase (default: 'update') */
	phase?: SystemPhase;
}

// ==================== Helper Functions ====================

export interface TweenOptions<EventTypes extends Record<string, any> = Record<string, any>> {
	/** Explicit starting value (default: captures current value on first tick) */
	from?: number;
	/** Easing function (default: linear) */
	easing?: EasingFn;
	/** Loop mode (default: 'once') */
	loop?: LoopMode;
	/** Number of loops. -1 = infinite (default: 1) */
	loops?: number;
	/** Event name to publish when tween completes */
	onComplete?: TweenEventName<EventTypes>;
}

/**
 * Create a single-target tween component.
 *
 * @param component Component name on the entity
 * @param field Field path (dot-separated for nested, e.g. 'position.x')
 * @param to Target value
 * @param duration Duration in seconds
 * @param options Optional configuration
 * @returns Component object suitable for spreading into spawn()
 */
export function createTween<EventTypes extends Record<string, any> = Record<string, any>>(
	component: string,
	field: string,
	to: number,
	duration: number,
	options?: TweenOptions<EventTypes>,
): Pick<TweenComponentTypes<EventTypes>, 'tween'> {
	const {
		from,
		easing = linear,
		loop = 'once',
		loops = 1,
		onComplete,
	} = options ?? {};

	return {
		tween: {
			steps: [{
				targets: [{
					component,
					path: field.split('.'),
					from: from ?? null,
					to,
				}],
				duration,
				easing,
			}],
			currentStep: 0,
			elapsed: 0,
			loop,
			totalLoops: loops,
			completedLoops: 0,
			direction: 1,
			state: 'pending',
			onComplete,
			justFinished: false,
		},
	};
}

export interface TweenSequenceStepInput {
	targets: ReadonlyArray<{
		component: string;
		field: string;
		to: number;
		from?: number;
	}>;
	duration: number;
	easing?: EasingFn;
}

export interface TweenSequenceOptions<EventTypes extends Record<string, any> = Record<string, any>> {
	/** Loop mode (default: 'once') */
	loop?: LoopMode;
	/** Number of loops. -1 = infinite (default: 1) */
	loops?: number;
	/** Event name to publish when tween completes */
	onComplete?: TweenEventName<EventTypes>;
}

/**
 * Create a multi-step tween sequence. Each step can have parallel targets.
 *
 * @param steps Array of step definitions
 * @param options Optional configuration
 * @returns Component object suitable for spreading into spawn()
 */
export function createTweenSequence<EventTypes extends Record<string, any> = Record<string, any>>(
	steps: ReadonlyArray<TweenSequenceStepInput>,
	options?: TweenSequenceOptions<EventTypes>,
): Pick<TweenComponentTypes<EventTypes>, 'tween'> {
	const {
		loop = 'once',
		loops = 1,
		onComplete,
	} = options ?? {};

	return {
		tween: {
			steps: steps.map((step) => ({
				targets: step.targets.map((target) => ({
					component: target.component,
					path: target.field.split('.'),
					from: target.from ?? null,
					to: target.to,
				})),
				duration: step.duration,
				easing: step.easing ?? linear,
			})),
			currentStep: 0,
			elapsed: 0,
			loop,
			totalLoops: loops,
			completedLoops: 0,
			direction: 1,
			state: 'pending',
			onComplete,
			justFinished: false,
		},
	};
}

// ==================== Kit Types ====================

type AnyECSpresso = import('ecspresso').default<any, any, any, any, any, any, any>;

/**
 * Recursively produce a union of dot-separated paths that resolve to `number`
 * within type T. Depth-limited to 4 levels to prevent TS recursion errors.
 *
 * @example
 * NumericPaths<{ x: number; y: number }> // 'x' | 'y'
 * NumericPaths<{ position: { x: number }; rotation: number }> // 'position.x' | 'rotation'
 */
export type NumericPaths<T, Depth extends readonly unknown[] = []> =
	Depth['length'] extends 4 ? never :
	T extends readonly unknown[] ? never :
	T extends Record<string, unknown>
		? { [K in keyof T & string]:
			NonNullable<T[K]> extends number
				? K
				: NonNullable<T[K]> extends readonly unknown[]
					? never
					: NonNullable<T[K]> extends Record<string, unknown>
						? `${K}.${NumericPaths<NonNullable<T[K]>, [...Depth, unknown]>}`
						: never
		}[keyof T & string]
		: never;

/**
 * Discriminated union over component names: each variant constrains `field`
 * to the numeric paths of that component. TS narrows inline object literals
 * by `component` discriminant — zero runtime overhead.
 */
export type TypedTweenTargetInput<C extends Record<string, any>> = {
	[K in keyof C & string]: {
		component: K;
		field: NumericPaths<C[K]>;
		to: number;
		from?: number;
	}
}[keyof C & string];

export interface TypedTweenSequenceStepInput<C extends Record<string, any>> {
	targets: ReadonlyArray<TypedTweenTargetInput<C>>;
	duration: number;
	easing?: EasingFn;
}

export interface TweenKit<W extends AnyECSpresso, G extends string = 'tweens'> {
	bundle: Bundle<TweenComponentTypes<EventsOfWorld<W>>, EventsOfWorld<W>, {}, {}, {}, 'tween-update', G>;
	createTween: <K extends keyof ComponentsOfWorld<W> & string>(
		component: K,
		field: NumericPaths<ComponentsOfWorld<W>[K]>,
		to: number,
		duration: number,
		options?: TweenOptions<EventsOfWorld<W>>,
	) => Pick<TweenComponentTypes<EventsOfWorld<W>>, 'tween'>;
	createTweenSequence: (
		steps: ReadonlyArray<TypedTweenSequenceStepInput<ComponentsOfWorld<W>>>,
		options?: TweenSequenceOptions<EventsOfWorld<W>>,
	) => Pick<TweenComponentTypes<EventsOfWorld<W>>, 'tween'>;
}

/**
 * Create a typed tween kit that captures the world type W.
 *
 * The returned `createTween` and `createTweenSequence` validate component names
 * and field paths at compile time. Runtime behavior is identical to the standalone
 * functions — all validation is type-level only.
 *
 * @template W - Concrete ECS world type (e.g. `typeof ecs`)
 * @template G - System group name (default: 'tweens')
 * @param options - Optional bundle configuration (same as createTweenBundle)
 * @returns A kit object with bundle, createTween, createTweenSequence
 *
 * @example
 * ```typescript
 * const kit = createTweenKit<typeof ecs>();
 * // or: const kit = createTweenKit<ECS>();
 *
 * const ecs = ECSpresso.create()
 *   .withBundle(kit.bundle)
 *   .build();
 *
 * // Type-safe: 'position' must be a component, 'x' must be a numeric field
 * kit.createTween('position', 'x', 100, 1);
 *
 * // Type error: 'z' is not a field of position
 * kit.createTween('position', 'z', 100, 1);
 * ```
 */
export function createTweenKit<W extends AnyECSpresso, G extends string = 'tweens'>(
	options?: TweenBundleOptions<G>,
): TweenKit<W, G> {
	return {
		bundle: createTweenBundle<EventsOfWorld<W>, G>(options),
		createTween: createTween as TweenKit<W, G>['createTween'],
		createTweenSequence: createTweenSequence as TweenKit<W, G>['createTweenSequence'],
	};
}

// ==================== Field Path Resolution ====================

/**
 * Module-scoped mutable result to avoid per-call allocation in hot path.
 */
const _fieldRef: { parent: Record<string, unknown>; key: string } = { parent: {} as Record<string, unknown>, key: '' };

/**
 * Traverse an object by path segments. Returns the parent object and final key
 * for read/write, or null if any segment is missing.
 */
function resolveField(obj: Record<string, unknown>, path: readonly string[]): typeof _fieldRef | null {
	const lastIdx = path.length - 1;
	let current: Record<string, unknown> = obj;

	for (let i = 0; i < lastIdx; i++) {
		const segment = path[i];
		if (segment === undefined) return null;
		const next = current[segment];
		if (next === null || next === undefined || typeof next !== 'object') return null;
		current = next as Record<string, unknown>;
	}

	const finalKey = path[lastIdx];
	if (finalKey === undefined) return null;
	if (!(finalKey in current)) return null;

	_fieldRef.parent = current;
	_fieldRef.key = finalKey;
	return _fieldRef;
}

function readField(obj: Record<string, unknown>, path: readonly string[]): number | null {
	const ref = resolveField(obj, path);
	if (!ref) return null;
	const val = ref.parent[ref.key];
	return typeof val === 'number' ? val : null;
}

function writeField(obj: Record<string, unknown>, path: readonly string[], value: number): boolean {
	const ref = resolveField(obj, path);
	if (!ref) return false;
	ref.parent[ref.key] = value;
	return true;
}

// ==================== System Logic ====================

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/**
 * Resolve all null `from` values by reading current component field values.
 */
function resolveFromValues<E extends Record<string, any>>(
	tween: Tween<E>,
	entityComponents: Record<string, unknown>,
): void {
	for (const step of tween.steps) {
		for (const target of step.targets) {
			if (target.from !== null) continue;
			const comp = entityComponents[target.component];
			if (!comp || typeof comp !== 'object') continue;
			const val = readField(comp as Record<string, unknown>, target.path);
			if (val !== null) {
				target.from = val;
			} else {
				target.from = 0;
			}
		}
	}
}

/**
 * Apply interpolation for a step's targets at a given progress.
 */
function applyStep(
	step: TweenStep,
	progress: number,
	entityComponents: Record<string, unknown>,
	entityId: number,
	markChanged: (entityId: number, componentName: string) => void,
): void {
	const easedT = step.easing(progress);

	for (const target of step.targets) {
		const comp = entityComponents[target.component];
		if (!comp || typeof comp !== 'object') continue;
		const from = target.from ?? 0;
		const value = from + (target.to - from) * easedT;
		const written = writeField(comp as Record<string, unknown>, target.path, value);
		if (written) {
			markChanged(entityId, target.component);
		}
	}
}

/**
 * Snap all targets in a step to their final values (from or to depending on direction).
 */
function snapStepToEnd(
	step: TweenStep,
	entityComponents: Record<string, unknown>,
	entityId: number,
	markChanged: (entityId: number, componentName: string) => void,
): void {
	for (const target of step.targets) {
		const comp = entityComponents[target.component];
		if (!comp || typeof comp !== 'object') continue;
		const written = writeField(comp as Record<string, unknown>, target.path, target.to);
		if (written) {
			markChanged(entityId, target.component);
		}
	}
}

/**
 * Reverse all from/to values in every step (for yoyo).
 */
function reverseAllTargets<E extends Record<string, any>>(tween: Tween<E>): void {
	for (const step of tween.steps) {
		for (const target of step.targets) {
			const tmp = target.from ?? 0;
			target.from = target.to;
			target.to = tmp;
		}
	}
}

// ==================== Bundle Factory ====================

/**
 * Create a tween bundle for ECSpresso.
 *
 * This bundle provides:
 * - Tween system that processes all tween components each frame
 * - Support for single-field, multi-target, and multi-step sequences
 * - 31 standard easing functions
 * - Loop modes: once, loop, yoyo
 * - `justFinished` flag for one-frame completion detection
 * - `onComplete` event publishing
 * - Change detection via markChanged
 */
export function createTweenBundle<EventTypes extends Record<string, any> = Record<string, any>, G extends string = 'tweens'>(
	options?: TweenBundleOptions<G>
): Bundle<TweenComponentTypes<EventTypes>, EventTypes, {}, {}, {}, 'tween-update', G> {
	const {
		systemGroup = 'tweens',
		priority = 0,
		phase = 'update',
	} = options ?? {};

	const bundle = new Bundle<TweenComponentTypes<EventTypes>, EventTypes, {}>('tweens');

	bundle
		.addSystem('tween-update')
		.setPriority(priority)
		.inPhase(phase)
		.inGroup(systemGroup)
		.addQuery('tweens', {
			with: ['tween'],
		})
		.setProcess((queries, deltaTime, ecs) => {
			for (const entity of queries.tweens) {
				const tween = entity.components.tween as Tween<EventTypes>;
				const entityComponents = entity.components as Record<string, unknown>;

				// Reset justFinished flag from previous frame
				if (tween.justFinished) {
					tween.justFinished = false;
					// Component removal was queued, skip processing
					continue;
				}

				// Skip completed tweens
				if (tween.state === 'complete') continue;

				// Resolve pending state: capture null from values
				if (tween.state === 'pending') {
					resolveFromValues(tween, entityComponents);
					tween.state = 'active';
				}

				// Process active tween
				const currentStep = tween.steps[tween.currentStep];
				if (!currentStep) continue;

				tween.elapsed += deltaTime;

				// Process steps, handling overflow across multiple steps
				processTweenProgress(tween, entityComponents, entity.id, ecs);
			}
		})
		.and();

	function processTweenProgress(
		tween: Tween<EventTypes>,
		entityComponents: Record<string, unknown>,
		entityId: number,
		ecs: { markChanged: (entityId: number, componentName: any) => void; eventBus: { publish: (event: any, data: any) => void }; commands: { removeComponent: (entityId: number, componentName: any) => void } },
	): void {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const currentStep = tween.steps[tween.currentStep];
			if (!currentStep) return;

			// Zero-duration steps complete immediately
			if (currentStep.duration <= 0) {
				snapStepToEnd(currentStep, entityComponents, entityId, ecs.markChanged.bind(ecs));
				tween.elapsed = 0;

				if (!advanceStep(tween, entityComponents, entityId, ecs)) return;
				continue;
			}

			if (tween.elapsed >= currentStep.duration) {
				// Step complete — snap to end and carry overflow
				snapStepToEnd(currentStep, entityComponents, entityId, ecs.markChanged.bind(ecs));
				const overflow = tween.elapsed - currentStep.duration;
				tween.elapsed = overflow;

				if (!advanceStep(tween, entityComponents, entityId, ecs)) return;
				continue;
			}

			// Step in progress — interpolate
			const progress = clamp(tween.elapsed / currentStep.duration, 0, 1);
			applyStep(currentStep, progress, entityComponents, entityId, ecs.markChanged.bind(ecs));
			return;
		}
	}

	/**
	 * Advance to next step. Returns true if there's more work to process,
	 * false if the tween has completed or looped.
	 */
	function advanceStep(
		tween: Tween<EventTypes>,
		entityComponents: Record<string, unknown>,
		entityId: number,
		ecs: { markChanged: (entityId: number, componentName: any) => void; eventBus: { publish: (event: any, data: any) => void }; commands: { removeComponent: (entityId: number, componentName: any) => void } },
	): boolean {
		const nextStep = tween.currentStep + 1;

		if (nextStep < tween.steps.length) {
			// More steps — resolve from values for next step and continue
			tween.currentStep = nextStep;
			const step = tween.steps[nextStep];
			if (step) {
				for (const target of step.targets) {
					if (target.from !== null) continue;
					const comp = entityComponents[target.component];
					if (!comp || typeof comp !== 'object') continue;
					const val = readField(comp as Record<string, unknown>, target.path);
					target.from = val ?? 0;
				}
			}
			return true;
		}

		// All steps done — handle loop/complete
		return handleTweenEnd(tween, entityId, ecs);
	}

	function handleTweenEnd(
		tween: Tween<EventTypes>,
		entityId: number,
		ecs: { markChanged: (entityId: number, componentName: any) => void; eventBus: { publish: (event: any, data: any) => void }; commands: { removeComponent: (entityId: number, componentName: any) => void } },
	): boolean {
		tween.completedLoops++;

		if (tween.loop === 'once') {
			completeTween(tween, entityId, ecs);
			return false;
		}

		// Check if finite loops exhausted
		if (tween.totalLoops > 0 && tween.completedLoops >= tween.totalLoops) {
			completeTween(tween, entityId, ecs);
			return false;
		}

		// Loop continues
		if (tween.loop === 'yoyo') {
			tween.direction = tween.direction === 1 ? -1 : 1;
			reverseAllTargets(tween);
		}

		tween.currentStep = 0;

		// For 'loop' mode, from values stay as-is so the animation replays identically.
		// For 'yoyo' mode, reverseAllTargets already swapped from/to.

		return tween.elapsed > 0;
	}

	function completeTween(
		tween: Tween<EventTypes>,
		entityId: number,
		ecs: { eventBus: { publish: (event: any, data: any) => void }; commands: { removeComponent: (entityId: number, componentName: any) => void } },
	): void {
		tween.state = 'complete';
		tween.justFinished = true;

		publishTweenEvent(ecs, entityId, tween);
		ecs.commands.removeComponent(entityId, 'tween');
	}

	function publishTweenEvent(
		ecs: { eventBus: { publish: (event: any, data: any) => void } },
		entityId: number,
		tween: Tween<EventTypes>,
	): void {
		if (!tween.onComplete) return;
		const eventData: TweenEventData = {
			entityId,
			stepCount: tween.steps.length,
		};
		ecs.eventBus.publish(tween.onComplete, eventData);
	}

	return bundle as Bundle<TweenComponentTypes<EventTypes>, EventTypes, {}, {}, {}, 'tween-update', G>;
}
