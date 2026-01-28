import { Container } from "pixi.js";
import Bundle from "../../../src/bundle";
import { createBounds } from "../../../src/bundles/utils/bounds";
import type { Components, Events, Resources } from "../types";

/**
 * Game-specific initialization: container hierarchy, game loop, bounds.
 * PixiJS Application is provided by the pixi bundle.
 */
export default function createInitBundle() {
	return new Bundle<Components, Events, Resources>('init-bundle')
		.addSystem('init')
		.setOnInitialize((ecs) => {
			const pixiApp = ecs.getResource('pixiApp');

			// Create containers for entities and UI
			const gameContainer = new Container();
			const entityContainer = new Container();
			const uiContainer = new Container();

			// Add containers to the stage
			pixiApp.stage.addChild(gameContainer);
			gameContainer.addChild(entityContainer);
			gameContainer.addChild(uiContainer);

			// Update bounds to match actual screen size
			const bounds = createBounds(pixiApp.screen.width, pixiApp.screen.height);

			ecs
				.addResource('gameContainer', gameContainer)
				.addResource('entityContainer', entityContainer)
				.addResource('uiContainer', uiContainer)
				.addResource('bounds', bounds);
		})
		.setEventHandlers({
			gameInit: {
				handler(_, ecs) {
					const pixiApp = ecs.getResource('pixiApp');
					pixiApp.ticker.add(ticker => {
						ecs.update(ticker.deltaMS / 1_000);
					});
				},
			},
		})
		.bundle;
}
