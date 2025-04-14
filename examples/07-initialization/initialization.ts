import ECSpresso, { Bundle } from "../../src";

interface Components {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	sprite: { id: string; scale: number };
}

interface Events {
	gameReady: void;
	gameStart: void;
	playerMove: { dx: number; dy: number };
}

interface Resources {
	gameState: {
		status: 'loading' | 'ready' | 'playing' | 'paused';
		score: number;
		startTime?: number;
	};
	assets: {
		loaded: boolean;
		sprites: Record<string, any>;
		sounds: Record<string, any>;
	};
	controlSettings: {
		sensitivity: number;
		invertY: boolean;
	};
}

async function main() {
	console.log("Running initialization example");

	// Create the world with the various game bundles
	const world = ECSpresso
		.create<Components, Events, Resources>()
		.withBundle(createGameBundle())
		.withBundle(createPlayerBundle())
		.withBundle(createRenderingBundle())
		.build()
		// Add resources using factory functions
		.addResource('gameState', {
			status: 'loading',
			score: 0
		})
		.addResource('assets', async () => {
			// Simulate loading assets asynchronously
			console.log("Loading assets...");
			await new Promise(resolve => setTimeout(resolve, 500));

			return {
				loaded: true,
				sprites: {
					player: { url: 'player.png' },
					enemy: { url: 'enemy.png' },
					background: { url: 'background.png' }
				},
				sounds: {
					jump: { url: 'jump.mp3' },
					explosion: { url: 'explosion.mp3' }
				}
			};
		})
		.addResource('controlSettings', () => {
			console.log("Initializing control settings...");
			return {
				sensitivity: 1.0,
				invertY: false
			};
		});

	// Initialize everything - this will:
	// 1. Initialize all resources (like assets and controlSettings)
	// 2. Call onInitialize for all systems
	console.log("Starting initialization...");
	await world.initialize();
	console.log("Initialization complete!");

	// Trigger game start
	world.eventBus.publish('gameStart');

	// Run a few update cycles to simulate the game loop
	for (let i = 0; i < 5; i++) {
		world.update(1/60);
		await new Promise(resolve => setTimeout(resolve, 100));

		// Simulate player movement every other frame
		if (i % 2 === 0) {
			world.eventBus.publish('playerMove', { dx: 1, dy: 0 });
		}
	}
}

function createGameBundle() {
	return new Bundle<Components, Events, Resources>('game-bundle')
		.addSystem('gameController')
		.setOnInitialize(async (ecs) => {
			console.log("Initializing game controller system...");

			// Access resources that were initialized
			const assets = ecs.getResource('assets');
			console.log(`Game assets loaded: ${Object.keys(assets.sprites).length} sprites and ${Object.keys(assets.sounds).length} sounds`);

			// Update game state
			const gameState = ecs.getResource('gameState');
			gameState.status = 'ready';

			// Publish that the game is ready
			ecs.eventBus.publish('gameReady');
		})
		.setEventHandlers({
			gameReady: {
				handler(_data, _ecs) {
					console.log("Game is ready to start!");
				}
			},
			gameStart: {
				handler(_data, ecs) {
					console.log("Game started!");
					const gameState = ecs.getResource('gameState');
					gameState.status = 'playing';
					gameState.startTime = Date.now();
				}
			}
		})
		.build()
		.bundle;
}

function createPlayerBundle() {
	return new Bundle<Components, Events, Resources>('player-bundle')
		.addSystem('playerController')
		.setOnInitialize((ecs) => {
			console.log("Initializing player controller system...");

			// Create player entity during initialization
			const playerEntity = ecs.entityManager.createEntity();
			ecs.entityManager.addComponents(playerEntity, {
				position: { x: 100, y: 100 },
				velocity: { x: 0, y: 0 },
				sprite: { id: 'player', scale: 1.0 }
			});

			console.log("Player entity created with ID:", playerEntity.id);
		})
		.setEventHandlers({
			playerMove: {
				handler(data, ecs) {
					const sensitivity = ecs.getResource('controlSettings').sensitivity;
					const playerEntities = ecs.getEntitiesWithComponents(['position', 'velocity', 'sprite']);

					if (playerEntities.length === 0) return;

					const player = playerEntities[0];
					if (!player) return;

					player.components.velocity.x = data.dx * sensitivity * 10;
					player.components.velocity.y = data.dy * sensitivity * 10;

					console.log(`Player moving: vx=${player.components.velocity.x}, vy=${player.components.velocity.y}`);
				}
			}
		})
		.addQuery('players', { with: ['position', 'velocity'] })
		.setProcess((queries, deltaTime, ecs) => {
			// Only process if game is playing
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'playing') return;

			// Update player positions based on velocity
			for (const entity of queries.players) {
				entity.components.position.x += entity.components.velocity.x * deltaTime;
				entity.components.position.y += entity.components.velocity.y * deltaTime;

				// Apply drag to slow down movement
				entity.components.velocity.x *= 0.9;
				entity.components.velocity.y *= 0.9;
			}
		})
		.build()
		.bundle;
}

function createRenderingBundle() {
	return new Bundle<Components, Events, Resources>('rendering-bundle')
		.addSystem('renderer')
		.setOnInitialize((_ecs) => {
			console.log("Initializing rendering system...");
		})
		.addQuery('renderables', { with: ['position', 'sprite'] })
		.setProcess((queries, _deltaTime, ecs) => {
			// Only render if game is ready or playing
			const gameState = ecs.getResource('gameState');
			if (gameState.status !== 'ready' && gameState.status !== 'playing') return;

			// Simple rendering to console
			for (const entity of queries.renderables) {
				const pos = entity.components.position;
				const sprite = entity.components.sprite;
				console.log(`Rendering sprite ${sprite.id} at position (${Math.round(pos.x)}, ${Math.round(pos.y)}), scale: ${sprite.scale}`);
			}
		})
		.build()
		.bundle;
}

// Run the example
main().catch(console.error);
