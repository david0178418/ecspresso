import ECSpresso from '../../src';
import { createRenderer2DPlugin } from '../../src/plugins/rendering/renderer2D';
import {
	createUIPlugin,
	createUIElement,
	createUILabel,
	createUIPanel,
	createUIProgressBar,
	type AnchorPreset,
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

// ---- Health & mana progress bars driven by HTML sliders ----

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

const wireSlider = (inputId: string, valId: string, entityId: number) => {
	const input = document.getElementById(inputId) as HTMLInputElement | null;
	const valSpan = document.getElementById(valId);
	if (!input || !valSpan) return;
	const apply = () => {
		const v = Number(input.value);
		valSpan.textContent = String(v);
		const bar = ecs.getComponent(entityId, 'uiProgressBar');
		if (bar) bar.value = v;
	};
	input.addEventListener('input', apply);
	apply();
};

wireSlider('health', 'health-val', healthBar.id);
wireSlider('mana', 'mana-val', manaBar.id);

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
