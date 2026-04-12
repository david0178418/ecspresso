import { defineCollisionLayers } from "../../src/plugins/collision";

/**
 * Collision layer definitions for Space Invaders.
 * Shared across all modules that spawn entities with colliders.
 */
const collisionLayers = defineCollisionLayers({
	player: ['enemyProjectile'],
	playerProjectile: ['enemy'],
	enemy: ['playerProjectile'],
	enemyProjectile: ['player'],
});

export default collisionLayers;
