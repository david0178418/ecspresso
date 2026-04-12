import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from '../../src';
import {
	createRenderer2DPlugin,
	createLocalTransform,
} from '../../src/plugins/renderers/renderer2D';
import { createInputPlugin } from '../../src/plugins/input';
import { createSelectionPlugin, createSelectable } from '../../src/plugins/selection';
import { createSteeringPlugin, createMoveSpeed } from '../../src/plugins/steering';

const ecs = ECSpresso.create()
	.withPlugin(createRenderer2DPlugin({
		background: '#1a1a2e',
		renderLayers: ['game', 'ui'],
	}))
	.withPlugin(createInputPlugin())
	.withPlugin(createSelectionPlugin({ renderLayer: 'ui' }))
	.withPlugin(createSteeringPlugin())
	.build();

// Issue move orders on right-click
ecs.addSystem('issue-move-order')
	.inPhase('preUpdate')
	.setPriority(50)
	.addQuery('selectedUnits', { with: ['selected', 'localTransform'] })
	.withResources(['inputState'])
	.setProcess(({ queries, ecs: world, resources: { inputState: input } }) => {
		if (!input.pointer.justPressed(2)) return;

		const { x, y } = input.pointer.position;
		for (const entity of queries.selectedUnits) {
			world.addComponent(entity.id, 'moveTarget', { x, y });
		}
	});

await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');
const unitRadius = 10;
const unitTexture = pixiApp.renderer.generateTexture(
	new Graphics().circle(0, 0, unitRadius).fill(0x4488FF)
);

const screenWidth = pixiApp.screen.width;
const screenHeight = pixiApp.screen.height;
const unitCount = 20;
const margin = 60;

for (let i = 0; i < unitCount; i++) {
	const x = margin + Math.random() * (screenWidth - margin * 2);
	const y = margin + Math.random() * (screenHeight - margin * 2);
	const sprite = new Sprite(unitTexture);
	sprite.anchor.set(0.5, 0.5);

	ecs.spawn({
		sprite,
		...createLocalTransform(x, y),
		...createSelectable(),
		...createMoveSpeed(150),
		renderLayer: 'game',
	});
}
