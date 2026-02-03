import { serve } from "bun";
import home from './index.html';
import basiceMovement from './01-movement/movement.html';
import playerInput from './02-player-input/player-input.html';
import events from './03-events/events.html';
import bundles from './04-bundles/bundles.html';
import spaceInvaders from './05-space-invaders/space-invaders.html';
import turretShooter from './06-turret-shooter/turret-shooter.html';
import hierarchy from './09-hierarchy/hierarchy.html';
import camera from './11-camera/camera.html';
import stateMachine from './12-state-machine/state-machine.html';
import tweens from './13-tweens/tweens.html';
import screens from './14-screens/screens.html';

const server = serve({
	port: 3000,
	development: {
		hmr: true,
	},
	routes: {
		'/': home,
		'/movement/': basiceMovement,
		'/player-input/': playerInput,
		'/events/': events,
		'/bundles/': bundles,
		'/space-invaders/': spaceInvaders,
		'/turret-shooter/': turretShooter,
		'/hierarchy/': hierarchy,
		'/camera/': camera,
		'/state-machine/': stateMachine,
		'/tweens/': tweens,
		'/screens/': screens,
	},
});

console.log(`Listening on ${server.hostname}:${server.port}`);
