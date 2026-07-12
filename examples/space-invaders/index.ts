import { game } from './game';
import registerCombat from './plugins/combat-plugin';
import registerInputProcessing from './plugins/input-plugin';
import registerSpawner from './plugins/spawner-plugin';
import registerUI from './plugins/ui-plugin';
import registerGameLogic from './plugins/game-logic-plugin';

[
	registerInputProcessing,
	registerSpawner,
	registerUI,
	registerGameLogic,
	registerCombat,
].forEach((register) => register(game));

await game.initialize();
game.eventBus.publish('gameInit', true);
