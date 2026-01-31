import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createInputBundle,
	createActionBinding,
	type InputResourceTypes,
	type ActionMap,
} from './input';

interface TestComponents {}
interface TestEvents {}
interface TestResources extends InputResourceTypes {}

function createWorld(options?: { actions?: ActionMap; target?: EventTarget }) {
	const target = options?.target ?? new EventTarget();
	const ecs = ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withBundle(createInputBundle({ target, actions: options?.actions }))
		.build();
	return { ecs, target };
}

async function initAndUpdate(ecs: ECSpresso<TestComponents, TestEvents, TestResources>, dt = 0.016) {
	await ecs.initialize();
	ecs.update(dt);
}

function dispatchKeyDown(target: EventTarget, key: string, repeat = false) {
	const event = new Event('keydown');
	Object.assign(event, { key, repeat });
	target.dispatchEvent(event);
}

function dispatchKeyUp(target: EventTarget, key: string) {
	const event = new Event('keyup');
	Object.assign(event, { key });
	target.dispatchEvent(event);
}

function dispatchPointerMove(target: EventTarget, clientX: number, clientY: number) {
	const event = new Event('pointermove');
	Object.assign(event, { clientX, clientY });
	target.dispatchEvent(event);
}

function dispatchPointerDown(target: EventTarget, button: number) {
	const event = new Event('pointerdown');
	Object.assign(event, { button });
	target.dispatchEvent(event);
}

function dispatchPointerUp(target: EventTarget, button: number) {
	const event = new Event('pointerup');
	Object.assign(event, { button });
	target.dispatchEvent(event);
}

describe('Input Bundle', () => {
	describe('Keyboard', () => {
		test('isDown true after keydown, false after keyup', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchKeyDown(target, 'a');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.isDown('a')).toBe(true);

			dispatchKeyUp(target, 'a');
			ecs.update(0.016);

			expect(input.keyboard.isDown('a')).toBe(false);
		});

		test('justPressed true only on press frame', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchKeyDown(target, 'a');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.justPressed('a')).toBe(true);

			// Next frame without new press — should be false
			ecs.update(0.016);
			expect(input.keyboard.justPressed('a')).toBe(false);
		});

		test('justReleased true only on release frame', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchKeyDown(target, 'a');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.justReleased('a')).toBe(false);

			dispatchKeyUp(target, 'a');
			ecs.update(0.016);

			expect(input.keyboard.justReleased('a')).toBe(true);

			// Next frame — should be false
			ecs.update(0.016);
			expect(input.keyboard.justReleased('a')).toBe(false);
		});

		test('multiple simultaneous keys', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchKeyDown(target, 'a');
			dispatchKeyDown(target, 'b');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.isDown('a')).toBe(true);
			expect(input.keyboard.isDown('b')).toBe(true);
			expect(input.keyboard.justPressed('a')).toBe(true);
			expect(input.keyboard.justPressed('b')).toBe(true);
		});

		test('ignores key repeat events', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchKeyDown(target, 'a');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.justPressed('a')).toBe(true);

			// Send repeat events, then update
			dispatchKeyDown(target, 'a', true);
			dispatchKeyDown(target, 'a', true);
			ecs.update(0.016);

			// Should NOT re-trigger justPressed
			expect(input.keyboard.justPressed('a')).toBe(false);
			// But key should still be down
			expect(input.keyboard.isDown('a')).toBe(true);
		});
	});

	describe('Pointer', () => {
		test('tracks position from pointermove', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchPointerMove(target, 100, 200);
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.pointer.position.x).toBe(100);
			expect(input.pointer.position.y).toBe(200);
		});

		test('tracks delta between frames, resets each frame', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchPointerMove(target, 50, 50);
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			// First move — delta is from origin (0,0)
			expect(input.pointer.delta.x).toBe(50);
			expect(input.pointer.delta.y).toBe(50);

			dispatchPointerMove(target, 80, 60);
			ecs.update(0.016);

			expect(input.pointer.delta.x).toBe(30);
			expect(input.pointer.delta.y).toBe(10);

			// No movement — delta resets to 0
			ecs.update(0.016);
			expect(input.pointer.delta.x).toBe(0);
			expect(input.pointer.delta.y).toBe(0);
		});

		test('button isDown/justPressed/justReleased', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchPointerDown(target, 0);
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.pointer.isDown(0)).toBe(true);
			expect(input.pointer.justPressed(0)).toBe(true);

			ecs.update(0.016);
			expect(input.pointer.isDown(0)).toBe(true);
			expect(input.pointer.justPressed(0)).toBe(false);

			dispatchPointerUp(target, 0);
			ecs.update(0.016);
			expect(input.pointer.isDown(0)).toBe(false);
			expect(input.pointer.justReleased(0)).toBe(true);

			ecs.update(0.016);
			expect(input.pointer.justReleased(0)).toBe(false);
		});

		test('multiple buttons', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchPointerDown(target, 0);
			dispatchPointerDown(target, 2);
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.pointer.isDown(0)).toBe(true);
			expect(input.pointer.isDown(2)).toBe(true);
			expect(input.pointer.justPressed(0)).toBe(true);
			expect(input.pointer.justPressed(2)).toBe(true);

			dispatchPointerUp(target, 0);
			ecs.update(0.016);
			expect(input.pointer.isDown(0)).toBe(false);
			expect(input.pointer.isDown(2)).toBe(true);
			expect(input.pointer.justReleased(0)).toBe(true);
			expect(input.pointer.justReleased(2)).toBe(false);
		});
	});

	describe('Action mapping', () => {
		test('isActive when bound key is down', async () => {
			const { ecs, target } = createWorld({
				actions: { jump: { keys: [' '] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');
			expect(input.actions.isActive('jump')).toBe(false);

			dispatchKeyDown(target, ' ');
			ecs.update(0.016);

			expect(input.actions.isActive('jump')).toBe(true);

			dispatchKeyUp(target, ' ');
			ecs.update(0.016);

			expect(input.actions.isActive('jump')).toBe(false);
		});

		test('isActive when bound button is down', async () => {
			const { ecs, target } = createWorld({
				actions: { shoot: { buttons: [0] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');

			dispatchPointerDown(target, 0);
			ecs.update(0.016);
			expect(input.actions.isActive('shoot')).toBe(true);

			dispatchPointerUp(target, 0);
			ecs.update(0.016);
			expect(input.actions.isActive('shoot')).toBe(false);
		});

		test('justActivated/justDeactivated edge detection', async () => {
			const { ecs, target } = createWorld({
				actions: { jump: { keys: [' '] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');

			dispatchKeyDown(target, ' ');
			ecs.update(0.016);
			expect(input.actions.justActivated('jump')).toBe(true);

			ecs.update(0.016);
			expect(input.actions.justActivated('jump')).toBe(false);
			expect(input.actions.isActive('jump')).toBe(true);

			dispatchKeyUp(target, ' ');
			ecs.update(0.016);
			expect(input.actions.justDeactivated('jump')).toBe(true);

			ecs.update(0.016);
			expect(input.actions.justDeactivated('jump')).toBe(false);
		});

		test('action bound to multiple keys (any activates)', async () => {
			const { ecs, target } = createWorld({
				actions: { jump: { keys: [' ', 'ArrowUp'] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');

			dispatchKeyDown(target, 'ArrowUp');
			ecs.update(0.016);
			expect(input.actions.isActive('jump')).toBe(true);

			dispatchKeyUp(target, 'ArrowUp');
			dispatchKeyDown(target, ' ');
			ecs.update(0.016);
			expect(input.actions.isActive('jump')).toBe(true);
		});

		test('action bound to both keys and buttons', async () => {
			const { ecs, target } = createWorld({
				actions: { shoot: { keys: ['z'], buttons: [0] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');

			dispatchKeyDown(target, 'z');
			ecs.update(0.016);
			expect(input.actions.isActive('shoot')).toBe(true);

			dispatchKeyUp(target, 'z');
			ecs.update(0.016);
			expect(input.actions.isActive('shoot')).toBe(false);

			dispatchPointerDown(target, 0);
			ecs.update(0.016);
			expect(input.actions.isActive('shoot')).toBe(true);
		});
	});

	describe('Action map mutation', () => {
		test('setActionMap applies new mappings', async () => {
			const { ecs, target } = createWorld({
				actions: { jump: { keys: [' '] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');

			input.setActionMap({ jump: { keys: ['w'] } });

			dispatchKeyDown(target, 'w');
			ecs.update(0.016);
			expect(input.actions.isActive('jump')).toBe(true);

			// Old binding should no longer work
			dispatchKeyUp(target, 'w');
			dispatchKeyDown(target, ' ');
			ecs.update(0.016);
			expect(input.actions.isActive('jump')).toBe(false);
		});

		test('getActionMap returns current map', async () => {
			const { ecs } = createWorld({
				actions: { jump: { keys: [' '] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');
			const map = input.getActionMap();
			expect(map).toEqual({ jump: { keys: [' '] } });
		});
	});

	describe('Cleanup', () => {
		test('listeners removed on system removal', async () => {
			const target = new EventTarget();
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createInputBundle({ target }))
				.build();

			await ecs.initialize();
			ecs.update(0.016);

			// Remove the input system (triggers onDetach)
			ecs.removeSystem('input-state');

			// Events after removal should have no effect on raw state
			dispatchKeyDown(target, 'a');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.isDown('a')).toBe(false);
		});
	});

	describe('Options', () => {
		test('default options work', async () => {
			const target = new EventTarget();
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createInputBundle({ target }))
				.build();

			await initAndUpdate(ecs);
			const input = ecs.getResource('inputState');
			expect(input).toBeDefined();
			expect(input.keyboard).toBeDefined();
			expect(input.pointer).toBeDefined();
			expect(input.actions).toBeDefined();
		});

		test('custom group/priority/phase', async () => {
			const target = new EventTarget();
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createInputBundle({
					target,
					systemGroup: 'custom-input',
					priority: 50,
					phase: 'update',
				}))
				.build();

			await initAndUpdate(ecs);
			const input = ecs.getResource('inputState');
			expect(input).toBeDefined();
		});

		test('initial action mappings', async () => {
			const { ecs, target } = createWorld({
				actions: { fire: { keys: ['f'] } },
			});
			await initAndUpdate(ecs);

			const input = ecs.getResource('inputState');
			dispatchKeyDown(target, 'f');
			ecs.update(0.016);
			expect(input.actions.isActive('fire')).toBe(true);
		});
	});

	describe('Edge cases', () => {
		test('key down+up in same frame (both justPressed and justReleased true)', async () => {
			const { ecs, target } = createWorld();
			await initAndUpdate(ecs);

			dispatchKeyDown(target, 'a');
			dispatchKeyUp(target, 'a');
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.keyboard.justPressed('a')).toBe(true);
			expect(input.keyboard.justReleased('a')).toBe(true);
			// Key ends up not down (released won the race)
			expect(input.keyboard.isDown('a')).toBe(false);
		});

		test('querying unmapped action returns false', async () => {
			const { ecs } = createWorld();
			await initAndUpdate(ecs);
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.actions.isActive('nonexistent')).toBe(false);
			expect(input.actions.justActivated('nonexistent')).toBe(false);
			expect(input.actions.justDeactivated('nonexistent')).toBe(false);
		});

		test('empty action bindings', async () => {
			const { ecs } = createWorld({
				actions: { empty: {} },
			});
			await initAndUpdate(ecs);
			ecs.update(0.016);

			const input = ecs.getResource('inputState');
			expect(input.actions.isActive('empty')).toBe(false);
		});
	});

	describe('Helper functions', () => {
test('createActionBinding creates a binding', () => {
			const binding = createActionBinding({ keys: ['a', 'b'], buttons: [0] });
			expect(binding.keys).toEqual(['a', 'b']);
			expect(binding.buttons).toEqual([0]);
		});
	});
});
