import { Application, Container } from "pixi.js";
import Bundle from "../../../src/bundle";
import type { Components, Events, Resources } from "../types";

export default async function createInitBundle() {
	const pixi = new Application();

	await pixi.init({
		background: '#000000',
		resizeTo: window,
	});

	return new Bundle<Components, Events, Resources>('init-bundle')
		.addResource('pixi', pixi)
		.addSystem('init')
		.setOnInitialize((ecs) => {
			// Create containers for entities and UI
			const gameContainer = new Container();
			const entityContainer = new Container();
			const uiContainer = new Container();

			// Add containers to the stage
			pixi.stage.addChild(gameContainer);
			gameContainer.addChild(entityContainer);
			gameContainer.addChild(uiContainer);

			document.getElementById('game-container')?.appendChild(pixi.canvas);

			ecs
				.addResource('pixi', pixi)
				.addResource('gameContainer', gameContainer)
				.addResource('entityContainer', entityContainer)
				.addResource('uiContainer', uiContainer);
		})
		.setEventHandlers({
			// Initialize the game
			gameInit: {
				handler(_, ecs) {
					pixi.ticker.add(ticker => {
						ecs.update(ticker.deltaMS / 1_000);
					});
				},
			},
		})
		.bundle;
}
