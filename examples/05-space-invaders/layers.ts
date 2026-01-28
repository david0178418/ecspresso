import { defineCollisionLayers } from "../../src/bundles/utils/collision";

/**
 * Collision layer definitions for Space Invaders.
 * Shared across all modules that spawn entities with colliders.
 */
export const layers = defineCollisionLayers({
	player: ['enemyProjectile'],
	playerProjectile: ['enemy'],
	enemy: ['playerProjectile'],
	enemyProjectile: ['player'],
});
