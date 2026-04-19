import ECSpresso from '../../src';
import { createRenderer2DPlugin } from '../../src/plugins/rendering/renderer2D';
import { createInputPlugin } from '../../src/plugins/input/input';
import {
	createUIPlugin,
	createUIElement,
	createUILabel,
	createUIPanel,
	createUIProgressBar,
	createUIButton,
	createUIDisabled,
	type AnchorPreset,
	type UIInteractionState,
} from '../../src/plugins/ui/ui';

const SCREEN_W = 900;
const SCREEN_H = 600;

const ecs = ECSpresso.create()
	.withPlugin(createRenderer2DPlugin({
		background: '#111827',
		width: SCREEN_W,
		height: SCREEN_H,
		renderLayers: ['ui'],
		screenSpaceLayers: ['ui'],
	}))
	.withPlugin(createInputPlugin())
	.withPlugin(createUIPlugin())
	.build();

await ecs.initialize();

// ---- One label + panel at each of the 9 anchor points ----

const presets: readonly AnchorPreset[] = [
	'top-left', 'top-center', 'top-right',
	'center-left', 'center', 'center-right',
	'bottom-left', 'bottom-center', 'bottom-right',
];

const presetOffsets: Record<AnchorPreset, { x: number; y: number }> = {
	'top-left': { x: 10, y: 10 },
	'top-center': { x: 0, y: 10 },
	'top-right': { x: -10, y: 10 },
	'center-left': { x: 10, y: 0 },
	'center': { x: 0, y: 0 },
	'center-right': { x: -10, y: 0 },
	'bottom-left': { x: 10, y: -10 },
	'bottom-center': { x: 0, y: -10 },
	'bottom-right': { x: -10, y: -10 },
};

for (const preset of presets) {
	ecs.spawn({
		...createUIElement({
			anchor: preset,
			offset: presetOffsets[preset],
			width: 140,
			height: 44,
		}),
		...createUIPanel({
			fillColor: 0x374151,
			borderColor: 0x6b7280,
			borderWidth: 1,
		}),
		renderLayer: 'ui',
	});
	ecs.spawn({
		...createUIElement({
			anchor: preset,
			offset: presetOffsets[preset],
			width: 140,
			height: 44,
		}),
		...createUILabel(preset, {
			fontSize: 13,
			fill: 0xe5e7eb,
			align: 'center',
		}),
		renderLayer: 'ui',
	});
}

// ---- Health & mana progress bars driven by on-screen buttons ----

const healthBar = ecs.spawn({
	...createUIElement({
		anchor: 'top-left',
		offset: { x: 20, y: 70 },
		width: 220,
		height: 18,
	}),
	...createUIProgressBar({
		value: 65, max: 100,
		fillColor: 0xef4444, bgColor: 0x1f2937,
	}),
	renderLayer: 'ui',
});

const manaBar = ecs.spawn({
	...createUIElement({
		anchor: 'top-left',
		offset: { x: 20, y: 94 },
		width: 220,
		height: 18,
	}),
	...createUIProgressBar({
		value: 40, max: 100,
		fillColor: 0x3b82f6, bgColor: 0x1f2937,
	}),
	renderLayer: 'ui',
});

// ---- Buttons: Health −/+, Mana −/+, plus a disabled button ----

const clamp = (v: number) => Math.max(0, Math.min(100, v));

const adjustBarValue = (barId: number, delta: number) => {
	const bar = ecs.getComponent(barId, 'uiProgressBar');
	if (bar) bar.value = clamp(bar.value + delta);
};

const handlers = new Map<number, () => void>();

const spawnButton = (label: string, offsetX: number, opts: { disabled?: boolean; onPress?: () => void } = {}) => {
	const button = ecs.spawn({
		...createUIElement({ anchor: 'top-left', offset: { x: offsetX, y: 120 }, width: 44, height: 28 }),
		...createUIPanel({ fillColor: 0x374151, borderColor: 0x6b7280, borderWidth: 1 }),
		...createUILabel(label, { fontSize: 14, fill: 0xe5e7eb, align: 'center' }),
		...createUIButton(),
		...(opts.disabled ? createUIDisabled() : {}),
		renderLayer: 'ui',
	});
	if (opts.onPress) handlers.set(button.id, opts.onPress);
	return button.id;
};

spawnButton('−', 20,  { onPress: () => adjustBarValue(healthBar.id, -10) });
spawnButton('+', 68,  { onPress: () => adjustBarValue(healthBar.id, +10) });
spawnButton('−', 128, { onPress: () => adjustBarValue(manaBar.id, -10) });
spawnButton('+', 176, { onPress: () => adjustBarValue(manaBar.id, +10) });
spawnButton('X', 236, { disabled: true });

ecs.eventBus.subscribe('uiButtonPressed', ({ entityId }) => {
	handlers.get(entityId)?.();
});

// ---- Consumer-side system: retint button panels by interaction state ----

const PANEL_COLORS_NORMAL = {
	none:    { fill: 0x374151, border: 0x6b7280 },
	hover:   { fill: 0x4b5563, border: 0x9ca3af },
	pressed: { fill: 0x1f2937, border: 0x6b7280 },
} as const satisfies Record<UIInteractionState, { fill: number; border: number }>;

const DISABLED_COLORS = { fill: 0x1f2937, border: 0x374151 };

ecs.addSystem('button-panel-tint')
	.inPhase('update')
	.addQuery('buttons', { with: ['uiButton', 'uiPanel', 'uiInteraction'] })
	.setProcess(({ queries, ecs }) => {
		for (const entity of queries.buttons) {
			const panel = entity.components.uiPanel;
			const isDisabled = ecs.getComponent(entity.id, 'uiDisabled') !== undefined;
			const colors = isDisabled
				? DISABLED_COLORS
				: PANEL_COLORS_NORMAL[entity.components.uiInteraction.state];
			if (panel.fillColor !== colors.fill || panel.borderColor !== colors.border) {
				panel.fillColor = colors.fill;
				panel.borderColor = colors.border;
			}
		}
	});

// ---- Vertical progress bar to demonstrate direction: 'btt' ----

ecs.spawn({
	...createUIElement({
		anchor: 'center-right',
		offset: { x: -40, y: 0 },
		width: 20,
		height: 180,
	}),
	...createUIProgressBar({
		value: 70, max: 100,
		fillColor: 0x10b981, bgColor: 0x1f2937,
		direction: 'btt',
	}),
	renderLayer: 'ui',
});

ecs.spawn({
	...createUIElement({
		anchor: 'center-right',
		pivot: 'center',
		offset: { x: -90, y: 0 },
		width: 60,
		height: 20,
	}),
	...createUILabel('70%', { fontSize: 13, fill: 0xe5e7eb, align: 'center' }),
	renderLayer: 'ui',
});
