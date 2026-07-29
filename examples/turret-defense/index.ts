import registerTurretSystems from './plugins/turret-plugin';
import registerEnemySystems from './plugins/enemy-plugin';
import registerCombatSystems from './plugins/combat-plugin';
import registerUISystems from './plugins/ui-plugin';
import { game } from './types';
import { spawnTurret, spawnBase } from './utils';

registerTurretSystems(game);
registerEnemySystems(game);
registerCombatSystems(game);
registerUISystems(game);

await game.initialize();

// Spawn base and turret, then start the game
const baseId = spawnBase(game);
const gameState = game.getResource('gameState');
gameState.baseEntityId = baseId;
spawnTurret(game);

game.eventBus.publish('gameInit', true);
