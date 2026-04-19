import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import { definePlugin } from '../../plugin';
import {
	createTransformPlugin,
	type TransformComponentTypes,
} from '../spatial/transform';
import type { BoundsResourceTypes } from '../spatial/bounds';
import type { InputResourceTypes, InputState, PointerState } from '../input/input';
import {
	ANCHOR_PRESETS,
	resolveAnchorPreset,
	resolveAnchorPosition,
	clampProgressValue,
	computeProgressFillRect,
	createUIElement,
	createUILabel,
	createUIPanel,
	createUIProgressBar,
	createUIPlugin,
	createUIButton,
	createUIDisabled,
	createUIMessageLog,
	appendLogLine,
	type UIComponentTypes,
	type LogFragment,
	type UIMessageLogAppendedEvent,
} from './ui';

// ==================== Test stub for inputState ====================

interface StubPointer extends PointerState {
	_setPosition: (x: number, y: number) => void;
	_setDown: (button: number, isDown: boolean) => void;
	_advance: () => void;
}

function createStubInputState(): { inputState: InputState; pointer: StubPointer } {
	const position = { x: 0, y: 0 };
	const delta = { x: 0, y: 0 };
	const down = new Set<number>();
	const pressed = new Set<number>();
	const released = new Set<number>();

	const pointer: StubPointer = {
		position,
		delta,
		isDown: (b) => down.has(b),
		justPressed: (b) => pressed.has(b),
		justReleased: (b) => released.has(b),
		_setPosition: (x, y) => { position.x = x; position.y = y; },
		_setDown: (b, isDown) => {
			const wasDown = down.has(b);
			if (isDown && !wasDown) { down.add(b); pressed.add(b); }
			else if (!isDown && wasDown) { down.delete(b); released.add(b); }
		},
		_advance: () => { pressed.clear(); released.clear(); },
	};

	const noopAction = {
		isActive: () => false,
		justActivated: () => false,
		justDeactivated: () => false,
	};
	const inputState: InputState = {
		keyboard: { isDown: () => false, justPressed: () => false, justReleased: () => false },
		pointer,
		gamepads: [],
		actions: noopAction,
		setActionMap: () => {},
		getActionMap: () => ({}),
		definePlayer: () => {},
		removePlayer: () => false,
		player: () => undefined,
		playerIds: () => [],
	};
	return { inputState, pointer };
}

// ==================== Pure Anchor Math ====================

describe('ANCHOR_PRESETS', () => {
	test('corners and center resolve to their normalized vec2s', () => {
		expect(ANCHOR_PRESETS['top-left']).toEqual({ x: 0, y: 0 });
		expect(ANCHOR_PRESETS['center']).toEqual({ x: 0.5, y: 0.5 });
		expect(ANCHOR_PRESETS['bottom-right']).toEqual({ x: 1, y: 1 });
	});
});

describe('resolveAnchorPreset', () => {
	test('resolves string preset to vec2', () => {
		expect(resolveAnchorPreset('center')).toEqual({ x: 0.5, y: 0.5 });
		expect(resolveAnchorPreset('bottom-right')).toEqual({ x: 1, y: 1 });
	});

	test('returns vec2 input as vec2 (structural copy, not reference)', () => {
		const input = { x: 0.3, y: 0.7 };
		const result = resolveAnchorPreset(input);
		expect(result).toEqual({ x: 0.3, y: 0.7 });
	});
});

describe('resolveAnchorPosition', () => {
	const call = (
		anchor: { x: number; y: number },
		pivot: { x: number; y: number },
		offset: { x: number; y: number },
		bounds: { width: number; height: number },
		size: { width: number; height: number },
	) => {
		const out = { x: 0, y: 0 };
		resolveAnchorPosition(anchor, pivot, offset, bounds, size, out);
		return out;
	};

	test('top-center with y offset centers horizontally, offsets down', () => {
		expect(call(
			{ x: 0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 20 },
			{ width: 800, height: 600 }, { width: 100, height: 40 },
		)).toEqual({ x: 350, y: 20 });
	});

	test('bottom-right with negative offset sits inset from corner', () => {
		expect(call(
			{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: -10, y: -10 },
			{ width: 800, height: 600 }, { width: 100, height: 40 },
		)).toEqual({ x: 690, y: 550 });
	});

	test('off-grid anchor and top-left pivot', () => {
		expect(call(
			{ x: 0.25, y: 0.5 }, { x: 0, y: 0 }, { x: 0, y: 0 },
			{ width: 800, height: 600 }, { width: 100, height: 40 },
		)).toEqual({ x: 200, y: 300 });
	});
});

// ==================== Component Factories ====================

describe('createUIElement', () => {
	test('string anchor resolves to preset vec2', () => {
		const c = createUIElement({ anchor: 'top-center', width: 100, height: 40 });
		expect(c.uiElement.anchor).toEqual({ x: 0.5, y: 0 });
	});

	test('pivot defaults to anchor when omitted', () => {
		const c = createUIElement({ anchor: 'center', width: 100, height: 40 });
		expect(c.uiElement.pivot).toEqual({ x: 0.5, y: 0.5 });
	});

	test('explicit pivot overrides default', () => {
		const c = createUIElement({
			anchor: 'top-center',
			pivot: 'top-left',
			width: 100,
			height: 40,
		});
		expect(c.uiElement.anchor).toEqual({ x: 0.5, y: 0 });
		expect(c.uiElement.pivot).toEqual({ x: 0, y: 0 });
	});

	test('offset defaults to zero vec2 when omitted', () => {
		const c = createUIElement({ anchor: 'top-left', width: 100, height: 40 });
		expect(c.uiElement.offset).toEqual({ x: 0, y: 0 });
	});

	test('off-grid vec2 anchor and pivot preserved verbatim', () => {
		const c = createUIElement({
			anchor: { x: 0.25, y: 0.5 },
			pivot: { x: 0, y: 0.5 },
			offset: { x: 4, y: -2 },
			width: 100,
			height: 40,
		});
		expect(c.uiElement.anchor).toEqual({ x: 0.25, y: 0.5 });
		expect(c.uiElement.pivot).toEqual({ x: 0, y: 0.5 });
		expect(c.uiElement.offset).toEqual({ x: 4, y: -2 });
		expect(c.uiElement.width).toBe(100);
		expect(c.uiElement.height).toBe(40);
	});
});

describe('createUILabel', () => {
	test('merges partial style overrides with defaults', () => {
		const c = createUILabel('Hi', { fontSize: 24, fill: 0xff0000 });
		expect(c.uiLabel.text).toBe('Hi');
		expect(c.uiLabel.style.fontSize).toBe(24);
		expect(c.uiLabel.style.fill).toBe(0xff0000);
		expect(c.uiLabel.style.align).toBe('left');
	});
});

describe('createUIPanel', () => {
	test('defaults borderWidth to 0 and borderColor to undefined when omitted', () => {
		const c = createUIPanel({ fillColor: 0x202030 });
		expect(c.uiPanel.fillColor).toBe(0x202030);
		expect(c.uiPanel.borderWidth).toBe(0);
		expect(c.uiPanel.borderColor).toBeUndefined();
	});

	test('keeps explicit border settings', () => {
		const c = createUIPanel({ fillColor: 0x000, borderColor: 0xffffff, borderWidth: 2 });
		expect(c.uiPanel.borderColor).toBe(0xffffff);
		expect(c.uiPanel.borderWidth).toBe(2);
	});
});

describe('createUIProgressBar', () => {
	test('defaults direction to ltr', () => {
		const c = createUIProgressBar({
			value: 5,
			max: 10,
			fillColor: 0x00ff00,
			bgColor: 0x000000,
		});
		expect(c.uiProgressBar.direction).toBe('ltr');
	});

	test('preserves explicit direction', () => {
		const c = createUIProgressBar({
			value: 5,
			max: 10,
			fillColor: 0x00ff00,
			bgColor: 0x000000,
			direction: 'ttb',
		});
		expect(c.uiProgressBar.direction).toBe('ttb');
	});
});

// ==================== Progress Bar Math ====================

describe('clampProgressValue', () => {
	test('value within [0, max] returns unchanged', () => {
		expect(clampProgressValue(5, 10)).toBe(5);
	});

	test('value greater than max clamps to max', () => {
		expect(clampProgressValue(15, 10)).toBe(10);
	});

	test('negative value clamps to zero', () => {
		expect(clampProgressValue(-5, 10)).toBe(0);
	});

	test('max of zero returns zero', () => {
		expect(clampProgressValue(5, 0)).toBe(0);
	});
});

describe('computeProgressFillRect', () => {
	const compute = (w: number, h: number, ratio: number, dir: 'ltr' | 'rtl' | 'ttb' | 'btt') => {
		const out = { x: 0, y: 0, width: 0, height: 0 };
		computeProgressFillRect(w, h, ratio, dir, out);
		return out;
	};

	test('ltr fills from left edge', () => {
		expect(compute(100, 40, 0.3, 'ltr')).toEqual({ x: 0, y: 0, width: 30, height: 40 });
	});

	test('rtl fills from right edge', () => {
		expect(compute(100, 40, 0.3, 'rtl')).toEqual({ x: 70, y: 0, width: 30, height: 40 });
	});

	test('ttb fills from top edge', () => {
		expect(compute(100, 40, 0.25, 'ttb')).toEqual({ x: 0, y: 0, width: 100, height: 10 });
	});

	test('btt fills from bottom edge', () => {
		expect(compute(100, 40, 0.25, 'btt')).toEqual({ x: 0, y: 30, width: 100, height: 10 });
	});

	test('ratio of zero produces empty fill', () => {
		expect(compute(100, 40, 0, 'ltr').width).toBe(0);
	});

	test('ratio of one produces full fill', () => {
		expect(compute(100, 40, 1, 'ltr')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
	});
});

// ==================== Plugin Integration ====================

interface TestComponents extends UIComponentTypes, TransformComponentTypes {
	renderLayer: string;
}

interface TestResources extends BoundsResourceTypes, InputResourceTypes {}

const stubRenderer = definePlugin('renderer2d').install(() => {});

const createTestEcs = (bounds?: { width: number; height: number }) => {
	const stub = createStubInputState();
	const ecs = ECSpresso.create()
		.withComponentTypes<TestComponents>()
		.withResourceTypes<TestResources>()
		.withPlugin(createTransformPlugin())
		.withPlugin(stubRenderer)
		.withPlugin(createUIPlugin())
		.build();
	ecs.addResource('bounds', { width: bounds?.width ?? 800, height: bounds?.height ?? 600 });
	ecs.addResource('inputState', stub.inputState);
	return { ecs, pointer: stub.pointer };
};

describe('createUIPlugin installation', () => {
	test('plugin installs without error alongside transform and renderer2d stub', () => {
		expect(() => createTestEcs()).not.toThrow();
	});

	test('spawning uiElement auto-adds localTransform and worldTransform', () => {
		const { ecs } = createTestEcs();
		const entity = ecs.spawn({
			...createUIElement({ anchor: 'center', width: 100, height: 40 }),
		});
		expect(ecs.entityManager.getComponent(entity.id, 'localTransform')).toBeDefined();
		expect(ecs.entityManager.getComponent(entity.id, 'worldTransform')).toBeDefined();
	});
});

describe('ui-anchor-resolve system', () => {
	test('top-center with y offset writes correct localTransform position', () => {
		const { ecs } = createTestEcs({ width: 800, height: 600 });
		const entity = ecs.spawn({
			...createUIElement({
				anchor: 'top-center',
				offset: { x: 0, y: 20 },
				width: 100,
				height: 40,
			}),
		});
		ecs.update(0.016);
		const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
		if (!lt) throw new Error('Expected localTransform');
		expect(lt.x).toBe(350);
		expect(lt.y).toBe(20);
	});

	test('bottom-right pivoted to corner anchors flush to bottom-right', () => {
		const { ecs } = createTestEcs({ width: 800, height: 600 });
		const entity = ecs.spawn({
			...createUIElement({
				anchor: 'bottom-right',
				width: 100,
				height: 40,
			}),
		});
		ecs.update(0.016);
		const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
		if (!lt) throw new Error('Expected localTransform');
		expect(lt.x).toBe(700);
		expect(lt.y).toBe(560);
	});

	test('bounds resize reflects on next update', () => {
		const { ecs } = createTestEcs({ width: 800, height: 600 });
		const entity = ecs.spawn({
			...createUIElement({
				anchor: 'bottom-right',
				width: 100,
				height: 40,
			}),
		});
		ecs.update(0.016);

		const bounds = ecs.getResource('bounds');
		bounds.width = 1024;
		bounds.height = 768;
		ecs.update(0.016);

		const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
		if (!lt) throw new Error('Expected localTransform');
		expect(lt.x).toBe(924);
		expect(lt.y).toBe(728);
	});

	test('off-grid anchor resolves correctly', () => {
		const { ecs } = createTestEcs({ width: 800, height: 600 });
		const entity = ecs.spawn({
			...createUIElement({
				anchor: { x: 0.25, y: 0.5 },
				pivot: { x: 0, y: 0.5 },
				width: 100,
				height: 40,
			}),
		});
		ecs.update(0.016);
		const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
		if (!lt) throw new Error('Expected localTransform');
		expect(lt.x).toBe(200);
		expect(lt.y).toBe(280);
	});
});

describe('ui-interaction system', () => {
	const spawnButton = (ecs: ReturnType<typeof createTestEcs>['ecs']) =>
		ecs.spawn({
			...createUIElement({ anchor: 'top-left', width: 100, height: 40 }),
			...createUIButton(),
		});

	const tickFrame = (ecs: ReturnType<typeof createTestEcs>['ecs'], pointer: ReturnType<typeof createTestEcs>['pointer']) => {
		ecs.update(0.016);
		pointer._advance();
	};

	test('createUIButton auto-registers uiInteractive and uiInteraction', () => {
		const { ecs } = createTestEcs();
		const entity = ecs.spawn({
			...createUIElement({ anchor: 'top-left', width: 100, height: 40 }),
			...createUIButton(),
		});
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteractive')).toBeDefined();
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')).toEqual({ state: 'none' });
	});

	test('pointer enters bounds → state transitions none → hover and emits hovered', () => {
		const { ecs, pointer } = createTestEcs();
		const entity = spawnButton(ecs);
		const events: Array<{ entityId: number; entered: boolean }> = [];
		ecs.eventBus.subscribe('uiButtonHovered', (e) => events.push(e));

		pointer._setPosition(50, 20);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('hover');
		expect(events).toEqual([{ entityId: entity.id, entered: true }]);
	});

	test('full click cycle: hover → pressed → release fires uiButtonPressed', () => {
		const { ecs, pointer } = createTestEcs();
		const entity = spawnButton(ecs);
		const pressedEvents: Array<{ entityId: number }> = [];
		ecs.eventBus.subscribe('uiButtonPressed', (e) => pressedEvents.push(e));

		pointer._setPosition(50, 20);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('hover');

		pointer._setDown(0, true);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('pressed');

		pointer._setDown(0, false);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('hover');
		expect(pressedEvents).toEqual([{ entityId: entity.id }]);
	});

	test('press then drag off and release does not fire uiButtonPressed (upOut)', () => {
		const { ecs, pointer } = createTestEcs();
		const entity = spawnButton(ecs);
		const pressedEvents: Array<{ entityId: number }> = [];
		ecs.eventBus.subscribe('uiButtonPressed', (e) => pressedEvents.push(e));

		pointer._setPosition(50, 20);
		tickFrame(ecs, pointer);
		pointer._setDown(0, true);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('pressed');

		pointer._setPosition(500, 500);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('none');

		pointer._setDown(0, false);
		tickFrame(ecs, pointer);
		expect(pressedEvents).toEqual([]);
	});

	test('pointer held outside then dragged onto widget stays hover, not pressed', () => {
		const { ecs, pointer } = createTestEcs();
		const entity = spawnButton(ecs);
		const pressedEvents: Array<{ entityId: number }> = [];
		ecs.eventBus.subscribe('uiButtonPressed', (e) => pressedEvents.push(e));

		pointer._setPosition(500, 500);
		pointer._setDown(0, true);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('none');

		pointer._setPosition(50, 20);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('hover');

		pointer._setDown(0, false);
		tickFrame(ecs, pointer);
		expect(pressedEvents).toEqual([]);
	});

	test('uiDisabled excludes entity from hit-testing', () => {
		const { ecs, pointer } = createTestEcs();
		const entity = ecs.spawn({
			...createUIElement({ anchor: 'top-left', width: 100, height: 40 }),
			...createUIButton(),
			...createUIDisabled(),
		});
		const hoverEvents: Array<{ entityId: number; entered: boolean }> = [];
		ecs.eventBus.subscribe('uiButtonHovered', (e) => hoverEvents.push(e));

		pointer._setPosition(50, 20);
		tickFrame(ecs, pointer);
		expect(ecs.entityManager.getComponent(entity.id, 'uiInteraction')?.state).toBe('none');
		expect(hoverEvents).toEqual([]);
	});
});

// ==================== Message Log ====================

describe('createUIMessageLog', () => {
	test('seeds empty lines and applies style defaults when omitted', () => {
		const c = createUIMessageLog({ maxLines: 10, visibleLines: 4, lineHeight: 16 });
		expect(c.uiMessageLog.lines).toEqual([]);
		expect(c.uiMessageLog.maxLines).toBe(10);
		expect(c.uiMessageLog.visibleLines).toBe(4);
		expect(c.uiMessageLog.lineHeight).toBe(16);
		expect(c.uiMessageLog.style.fontFamily).toBe('sans-serif');
	});

	test('initialLines are copied (not aliased)', () => {
		const initial: LogFragment[][] = [[{ text: 'hi', color: 0xffffff }]];
		const c = createUIMessageLog({ maxLines: 10, visibleLines: 4, lineHeight: 16, initialLines: initial });
		expect(c.uiMessageLog.lines).not.toBe(initial);
		expect(c.uiMessageLog.lines).toEqual(initial);
	});
});

describe('appendLogLine', () => {
	const spawnLog = (ecs: ReturnType<typeof createTestEcs>['ecs'], maxLines: number) =>
		ecs.spawn({
			...createUIElement({ anchor: 'top-left', width: 200, height: 100 }),
			...createUIMessageLog({ maxLines, visibleLines: maxLines, lineHeight: 16 }),
		});

	const frag = (text: string, color = 0xffffff): LogFragment => ({ text, color });

	test('appends a line and replaces the lines array reference (identity changes)', () => {
		const { ecs } = createTestEcs();
		const entity = spawnLog(ecs, 10);
		const before = ecs.entityManager.getComponent(entity.id, 'uiMessageLog');
		if (!before) throw new Error('Expected uiMessageLog');
		const beforeRef = before.lines;

		appendLogLine(ecs, entity.id, [frag('hello')]);
		ecs.update(0.016);

		const after = ecs.entityManager.getComponent(entity.id, 'uiMessageLog');
		if (!after) throw new Error('Expected uiMessageLog');
		expect(after.lines).not.toBe(beforeRef);
		expect(after.lines).toEqual([[frag('hello')]]);
	});

	test('FIFO truncation drops oldest when exceeding maxLines', () => {
		const { ecs } = createTestEcs();
		const entity = spawnLog(ecs, 3);

		[1, 2, 3, 4, 5].forEach((n) => appendLogLine(ecs, entity.id, [frag(`line ${n}`)]));
		ecs.update(0.016);

		const log = ecs.entityManager.getComponent(entity.id, 'uiMessageLog');
		if (!log) throw new Error('Expected uiMessageLog');
		expect(log.lines.length).toBe(3);
		expect(log.lines.map((line) => line[0]?.text)).toEqual(['line 3', 'line 4', 'line 5']);
	});

	test('publishes uiLogAppended exactly once per call with the same line reference', () => {
		const { ecs } = createTestEcs();
		const entity = spawnLog(ecs, 10);
		const events: UIMessageLogAppendedEvent[] = [];
		ecs.eventBus.subscribe('uiLogAppended', (e) => events.push(e));

		const line = [frag('You hit ', 0xffffff), frag('goblin', 0xef4444)];
		appendLogLine(ecs, entity.id, line);

		expect(events.length).toBe(1);
		expect(events[0]?.entityId).toBe(entity.id);
		expect(events[0]?.line).toBe(line);
	});

	test('mixed-color fragments are preserved per line', () => {
		const { ecs } = createTestEcs();
		const entity = spawnLog(ecs, 10);
		appendLogLine(ecs, entity.id, [frag('a', 0x111111), frag('b', 0x222222), frag('c', 0x333333)]);
		ecs.update(0.016);

		const log = ecs.entityManager.getComponent(entity.id, 'uiMessageLog');
		if (!log) throw new Error('Expected uiMessageLog');
		expect(log.lines[0]).toEqual([
			{ text: 'a', color: 0x111111 },
			{ text: 'b', color: 0x222222 },
			{ text: 'c', color: 0x333333 },
		]);
	});
});
