import ECSpresso from '../../src/ecspresso';

// Example demonstrating the improved resource API consistency

interface Components {
	score: { value: number };
	player: { name: string };
}

interface Events {
	scoreChanged: { newValue: number; previousValue: number };
}

interface Resources {
	gameConfig: {
		difficulty: 'easy' | 'normal' | 'hard';
		maxScore: number;
	};
	playerStats: {
		totalGamesPlayed: number;
		highScore: number;
	};
	sessionData: {
		startTime: number;
		currentSession: string;
	};
}

async function main() {
	console.log("Resource Management Example");
	console.log("===========================");

	const world = ECSpresso.create()
		.withComponentTypes<Components>()
		.withEventTypes<Events>()
		.withResourceTypes<Resources>()
		.build();

	// 1. Adding resources directly
	console.log("\n1. Adding resources directly:");
	world.addResource('gameConfig', {
		difficulty: 'normal',
		maxScore: 10000
	});

	// 2. Adding resources with factory functions
	console.log("2. Adding resources with factory functions:");
	world.addResource('playerStats', () => {
		console.log("  - Initializing player stats...");
		return {
			totalGamesPlayed: 0,
			highScore: 0
		};
	});

	// 3. Adding async factory functions
	console.log("3. Adding async factory functions:");
	world.addResource('sessionData', async () => {
		console.log("  - Loading session data asynchronously...");
		await new Promise(resolve => setTimeout(resolve, 100));
		return {
			startTime: Date.now(),
			currentSession: `session_${Math.random().toString(36).substring(7)}`
		};
	});

	// 4. Check what resources exist before initialization
	console.log("\n4. Resource status before initialization:");
	console.log("  - gameConfig exists:", world.hasResource('gameConfig'));
	console.log("  - playerStats exists:", world.hasResource('playerStats'));
	console.log("  - sessionData exists:", world.hasResource('sessionData'));
	console.log("  - playerStats needs init:", world.resourceNeedsInitialization('playerStats'));
	console.log("  - sessionData needs init:", world.resourceNeedsInitialization('sessionData'));

	// 5. Initialize all resources
	console.log("\n5. Initializing all resources:");
	await world.initializeResources();

	// 6. Access resources after initialization
	console.log("\n6. Accessing resources after initialization:");
	const config = world.getResource('gameConfig');
	console.log("  - Game config:", config);

	const stats = world.getResource('playerStats');
	console.log("  - Player stats:", stats);

	const session = world.getResource('sessionData');
	console.log("  - Session data:", session);

	// 7. Update resources using the update method
	console.log("\n7. Updating resources:");
	world.updateResource('playerStats', (current) => ({
		...current,
		totalGamesPlayed: current.totalGamesPlayed + 1,
		highScore: Math.max(current.highScore, 5000)
	}));

	const updatedStats = world.getResource('playerStats');
	console.log("  - Updated player stats:", updatedStats);

	// 8. Get all resource keys
	console.log("\n8. All resource keys:");
	const resourceKeys = world.getResourceKeys();
	console.log("  - Resource keys:", resourceKeys);

	// 9. Remove a resource
	console.log("\n9. Removing a resource:");
	const removed = world.removeResource('sessionData');
	console.log("  - Session data removed:", removed);
	console.log("  - Session data exists after removal:", world.hasResource('sessionData'));

	// 10. Add a system that uses resources
	console.log("\n10. System using resources:");
	world.addSystem('gameLogic')
		.setProcess((_queries, _deltaTime, ecs) => {
			const gameConfig = ecs.getResource('gameConfig');
			const playerStats = ecs.getResource('playerStats');

			// Example game logic using resources
			if (playerStats.highScore >= gameConfig.maxScore) {
				console.log("  - Player reached max score! Increasing difficulty...");
				ecs.updateResource('gameConfig', (cfg) => ({
					...cfg,
					difficulty: cfg.difficulty === 'easy' ? 'normal' :
								 cfg.difficulty === 'normal' ? 'hard' : 'hard',
					maxScore: cfg.maxScore * 2
				}));
			}
		})
		.build();

	// Run a few game updates
	console.log("\n11. Running game simulation:");
	for (let i = 0; i < 3; i++) {
		world.update(1/60);
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	console.log("\n12. Final game config:");
	const finalConfig = world.getResource('gameConfig');
	console.log("  - Final config:", finalConfig);

	console.log("\nResource management example completed!");
}

main().catch(console.error);
