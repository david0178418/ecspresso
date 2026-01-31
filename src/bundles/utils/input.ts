/**
 * Input Bundle for ECSpresso
 *
 * Provides frame-accurate keyboard, pointer (mouse + touch via PointerEvent),
 * and action mapping input. Resource-only bundle — input is polled via the
 * `inputState` resource. No ECS components or events.
 *
 * DOM events are accumulated between frames and snapshotted once per frame
 * in the system's process step, so all systems see consistent state.
 */

import Bundle from '../../bundle';
import type { SystemPhase } from '../../types';

// ==================== Public Types ====================

export interface Vec2 {
	x: number;
	y: number;
}

export interface KeyboardState {
	isDown(key: string): boolean;
	justPressed(key: string): boolean;
	justReleased(key: string): boolean;
}

export interface PointerState {
	readonly position: Readonly<Vec2>;
	readonly delta: Readonly<Vec2>;
	isDown(button: number): boolean;
	justPressed(button: number): boolean;
	justReleased(button: number): boolean;
}

export interface ActionState {
	isActive(action: string): boolean;
	justActivated(action: string): boolean;
	justDeactivated(action: string): boolean;
}

export interface InputState {
	readonly keyboard: KeyboardState;
	readonly pointer: PointerState;
	readonly actions: ActionState;
	setActionMap(actions: ActionMap): void;
	getActionMap(): Readonly<ActionMap>;
}

export interface ActionBinding {
	keys?: string[];
	buttons?: number[];
}

export type ActionMap = Record<string, ActionBinding>;

export interface InputResourceTypes {
	inputState: InputState;
}

export interface InputBundleOptions {
	/** System group name (default: 'input') */
	systemGroup?: string;
	/** Priority for input system (default: 100) */
	priority?: number;
	/** Execution phase (default: 'preUpdate') */
	phase?: SystemPhase;
	/** Initial action mappings */
	actions?: ActionMap;
	/** EventTarget to attach listeners to (default: globalThis). Pass a custom target for testability. */
	target?: EventTarget;
}

// ==================== Helper Functions ====================

/**
 * Define an action map with proper typing.
 *
 * @param map Object mapping action names to bindings
 * @returns The same map (identity, for convenience/documentation)
 *
 * @example
 * ```typescript
 * const actions = defineActionMap({
 *   jump: { keys: ['Space', 'ArrowUp'] },
 *   shoot: { keys: ['z'], buttons: [0] },
 * });
 * ```
 */
export function defineActionMap<T extends ActionMap>(map: T): T {
	return map;
}

/**
 * Create a single action binding.
 *
 * @param binding The binding configuration
 * @returns The same binding object
 */
export function createActionBinding(binding: ActionBinding): ActionBinding {
	return binding;
}

// ==================== Internal Types ====================

interface RawInputState {
	keysDown: Set<string>;
	keysPressed: string[];
	keysReleased: string[];
	buttonsDown: Set<number>;
	buttonsPressed: number[];
	buttonsReleased: number[];
	pointerX: number;
	pointerY: number;
	pointerDeltaX: number;
	pointerDeltaY: number;
	lastPointerX: number;
	lastPointerY: number;
	pointerMoved: boolean;
}

interface FrameSnapshot {
	keysDown: ReadonlySet<string>;
	keysPressed: ReadonlySet<string>;
	keysReleased: ReadonlySet<string>;
	buttonsDown: ReadonlySet<number>;
	buttonsPressed: ReadonlySet<number>;
	buttonsReleased: ReadonlySet<number>;
	pointerX: number;
	pointerY: number;
	pointerDeltaX: number;
	pointerDeltaY: number;
	actionsActive: ReadonlySet<string>;
	prevActionsActive: ReadonlySet<string>;
}

// ==================== Bundle Factory ====================

function createRawInputState(): RawInputState {
	return {
		keysDown: new Set(),
		keysPressed: [],
		keysReleased: [],
		buttonsDown: new Set(),
		buttonsPressed: [],
		buttonsReleased: [],
		pointerX: 0,
		pointerY: 0,
		pointerDeltaX: 0,
		pointerDeltaY: 0,
		lastPointerX: 0,
		lastPointerY: 0,
		pointerMoved: false,
	};
}

const EMPTY_SET_STRING: ReadonlySet<string> = new Set<string>();
const EMPTY_SET_NUMBER: ReadonlySet<number> = new Set<number>();

function createEmptySnapshot(): FrameSnapshot {
	return {
		keysDown: EMPTY_SET_STRING,
		keysPressed: EMPTY_SET_STRING,
		keysReleased: EMPTY_SET_STRING,
		buttonsDown: EMPTY_SET_NUMBER,
		buttonsPressed: EMPTY_SET_NUMBER,
		buttonsReleased: EMPTY_SET_NUMBER,
		pointerX: 0,
		pointerY: 0,
		pointerDeltaX: 0,
		pointerDeltaY: 0,
		actionsActive: EMPTY_SET_STRING,
		prevActionsActive: EMPTY_SET_STRING,
	};
}

function computeActiveActions(
	actionMap: ActionMap,
	keysDown: ReadonlySet<string>,
	buttonsDown: ReadonlySet<number>,
): Set<string> {
	const active = new Set<string>();
	for (const [name, binding] of Object.entries(actionMap)) {
		const keyActive = binding.keys?.some((k) => keysDown.has(k)) ?? false;
		const buttonActive = binding.buttons?.some((b) => buttonsDown.has(b)) ?? false;
		if (keyActive || buttonActive) {
			active.add(name);
		}
	}
	return active;
}

function snapshotRaw(raw: RawInputState, prevActionsActive: ReadonlySet<string>, actionMap: ActionMap): FrameSnapshot {
	const keysDown = new Set(raw.keysDown);
	const keysPressed = new Set(raw.keysPressed);
	const keysReleased = new Set(raw.keysReleased);
	const buttonsDown = new Set(raw.buttonsDown);
	const buttonsPressed = new Set(raw.buttonsPressed);
	const buttonsReleased = new Set(raw.buttonsReleased);

	const pointerDeltaX = raw.pointerMoved ? raw.pointerX - raw.lastPointerX : 0;
	const pointerDeltaY = raw.pointerMoved ? raw.pointerY - raw.lastPointerY : 0;

	const actionsActive = computeActiveActions(actionMap, keysDown, buttonsDown);

	const snapshot: FrameSnapshot = {
		keysDown,
		keysPressed,
		keysReleased,
		buttonsDown,
		buttonsPressed,
		buttonsReleased,
		pointerX: raw.pointerX,
		pointerY: raw.pointerY,
		pointerDeltaX,
		pointerDeltaY,
		actionsActive,
		prevActionsActive,
	};

	// Clear accumulation buffers
	raw.keysPressed = [];
	raw.keysReleased = [];
	raw.buttonsPressed = [];
	raw.buttonsReleased = [];
	raw.lastPointerX = raw.pointerX;
	raw.lastPointerY = raw.pointerY;
	raw.pointerMoved = false;

	return snapshot;
}

/**
 * Create an input bundle for ECSpresso.
 *
 * This bundle provides:
 * - Frame-accurate keyboard state (isDown, justPressed, justReleased)
 * - Pointer position/delta and button state (mouse + touch via PointerEvent)
 * - Named action mapping with runtime remapping
 * - Automatic listener cleanup on detach
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withBundle(createInputBundle({
 *     actions: {
 *       jump: { keys: ['Space', 'ArrowUp'] },
 *       shoot: { keys: ['z'], buttons: [0] },
 *     },
 *   }))
 *   .build();
 *
 * // In a system:
 * const input = ecs.getResource('inputState');
 * if (input.actions.justActivated('jump')) { ... }
 * if (input.keyboard.isDown('ArrowRight')) { ... }
 * ```
 */
export function createInputBundle(
	options?: InputBundleOptions
): Bundle<{}, {}, InputResourceTypes> {
	const {
		systemGroup = 'input',
		priority = 100,
		phase = 'preUpdate',
		actions: initialActions = {},
		target = globalThis,
	} = options ?? {};

	// Closure state
	const raw = createRawInputState();
	let snapshot = createEmptySnapshot();
	let actionMap: ActionMap = { ...initialActions };
	const cleanupFns: Array<() => void> = [];

	// The position/delta objects exposed via the resource.
	// Updated in-place each frame to avoid allocations.
	const position: Vec2 = { x: 0, y: 0 };
	const delta: Vec2 = { x: 0, y: 0 };

	// Build the InputState resource that closes over snapshot
	const keyboard: KeyboardState = {
		isDown: (key) => snapshot.keysDown.has(key),
		justPressed: (key) => snapshot.keysPressed.has(key),
		justReleased: (key) => snapshot.keysReleased.has(key),
	};

	const pointer: PointerState = {
		position,
		delta,
		isDown: (button) => snapshot.buttonsDown.has(button),
		justPressed: (button) => snapshot.buttonsPressed.has(button),
		justReleased: (button) => snapshot.buttonsReleased.has(button),
	};

	const actionState: ActionState = {
		isActive: (action) => snapshot.actionsActive.has(action),
		justActivated: (action) =>
			snapshot.actionsActive.has(action) && !snapshot.prevActionsActive.has(action),
		justDeactivated: (action) =>
			!snapshot.actionsActive.has(action) && snapshot.prevActionsActive.has(action),
	};

	const inputState: InputState = {
		keyboard,
		pointer,
		actions: actionState,
		setActionMap(newMap) {
			actionMap = { ...newMap };
		},
		getActionMap() {
			return { ...actionMap };
		},
	};

	// DOM event handlers
	function onKeyDown(e: Event) {
		const ke = e as KeyboardEvent;
		if (ke.repeat) return;
		raw.keysDown.add(ke.key);
		raw.keysPressed.push(ke.key);
	}

	function onKeyUp(e: Event) {
		const ke = e as KeyboardEvent;
		raw.keysDown.delete(ke.key);
		raw.keysReleased.push(ke.key);
	}

	function onPointerDown(e: Event) {
		const pe = e as unknown as PointerEvent;
		raw.buttonsDown.add(pe.button);
		raw.buttonsPressed.push(pe.button);
	}

	function onPointerMove(e: Event) {
		const pe = e as unknown as PointerEvent;
		raw.pointerX = pe.clientX;
		raw.pointerY = pe.clientY;
		raw.pointerMoved = true;
	}

	function onPointerUp(e: Event) {
		const pe = e as unknown as PointerEvent;
		raw.buttonsDown.delete(pe.button);
		raw.buttonsReleased.push(pe.button);
	}

	function addListener(type: string, handler: (e: Event) => void) {
		target.addEventListener(type, handler);
		cleanupFns.push(() => target.removeEventListener(type, handler));
	}

	// Build bundle
	const bundle = new Bundle<{}, {}, InputResourceTypes>('input');

	bundle.addResource('inputState', inputState);

	bundle
		.addSystem('input-state')
		.setPriority(priority)
		.inPhase(phase)
		.inGroup(systemGroup)
		.setOnInitialize(() => {
			addListener('keydown', onKeyDown);
			addListener('keyup', onKeyUp);
			addListener('pointerdown', onPointerDown);
			addListener('pointermove', onPointerMove);
			addListener('pointerup', onPointerUp);
		})
		.setOnDetach(() => {
			for (const cleanup of cleanupFns) {
				cleanup();
			}
			cleanupFns.length = 0;
		})
		.setProcess(() => {
			const prevActionsActive = snapshot.actionsActive;
			snapshot = snapshotRaw(raw, prevActionsActive, actionMap);

			// Update the exposed position/delta objects in-place
			position.x = snapshot.pointerX;
			position.y = snapshot.pointerY;
			delta.x = snapshot.pointerDeltaX;
			delta.y = snapshot.pointerDeltaY;
		})
		.and();

	return bundle;
}
