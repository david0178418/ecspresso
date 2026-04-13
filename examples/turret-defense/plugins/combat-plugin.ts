import { definePlugin } from '../types';

export default function createCombatPlugin() {
	return definePlugin({
		id: 'combat-plugin',
		install(world) {
			world
				.addSystem('combat')
				.inGroup('gameplay')
				.setEventHandlers({
					entityDied({ data, ecs }) {
						const enemy = ecs.getComponent(data.entityId, 'enemy');
						if (!enemy) return;

						const gameState = ecs.getResource('gameState');
						gameState.score += enemy.scoreValue;

						ecs.commands.removeEntity(data.entityId);
					},

					// Game over when base health reaches zero
					damage({ data, ecs }) {
						const base = ecs.getComponent(data.entityId, 'base');
						if (!base) return;

						const health = ecs.getComponent(data.entityId, 'health');
						if (!health || health.current > 0) return;

						const gameState = ecs.getResource('gameState');
						if (gameState.status === 'gameOver') return;

						gameState.status = 'gameOver';
						ecs.eventBus.publish('gameOver', { score: gameState.score });
					},
				});
		},
	});
}
