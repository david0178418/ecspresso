import { Graphics, Text, TextStyle, Container, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DPlugin,
	createSpriteComponents,
} from "../../src/plugins/renderers/renderer2D";

// -- Constants --

const SCREEN_W = 800;
const SCREEN_H = 500;
const GAME_DURATION = 20;
const DOT_COLORS = [0x4fc3f7, 0xf06292, 0xba68c8, 0x81c784, 0xffb74d, 0xe57373] as const;

// -- Dot entity tracking (for cleanup on screen exit) --

const activeDots = new Set<number>();

// -- ECS setup with screen definitions --

const ecs = ECSpresso
	.create()
	.withPlugin(createRenderer2DPlugin({
		init: { background: '#1a1a2e', width: SCREEN_W, height: SCREEN_H },
		container: document.body,
	}))
	.withComponentTypes<{
		dot: { lifetime: number; speed: number };
	}>()
	.withScreens(screens => screens
		.add('menu', {
			initialState: () => ({}),
		})
		.add('playing', {
			initialState: () => ({ score: 0, timeLeft: GAME_DURATION, spawnTimer: 0 }),
			onExit(ecsParam) {
				// Clean up all dot entities when leaving the playing screen
				activeDots.forEach(id => ecsParam.removeEntity(id));
				activeDots.clear();
			},
		})
		.add('paused', {
			initialState: () => ({}),
		})
		.add('gameOver', {
			initialState: (config: { finalScore: number }) => ({
				finalScore: config.finalScore,
			}),
		})
	)
	.build();

await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');

// -- UI helpers --

function createLabel(label: string, size: number, color: string): Text {
	const text = new Text({
		text: label,
		style: new TextStyle({
			fontFamily: 'monospace',
			fontSize: size,
			fill: color,
			align: 'center',
		}),
	});
	text.anchor.set(0.5);
	return text;
}

function centeredAt(text: Text, x: number, y: number): Text {
	text.position.set(x, y);
	return text;
}

// -- Screen UI containers --

// Menu
const menuContainer = new Container();
menuContainer.addChild(
	centeredAt(createLabel('Dot Catcher', 44, '#ffffff'), SCREEN_W / 2, SCREEN_H / 2 - 40),
	centeredAt(createLabel('Press SPACE to start', 18, '#888888'), SCREEN_W / 2, SCREEN_H / 2 + 30),
);

// Playing HUD
const hudContainer = new Container();
const scoreText = createLabel('Score: 0', 20, '#ffffff');
scoreText.anchor.set(0, 0);
scoreText.position.set(12, 10);
const timerText = createLabel('20', 20, '#ffffff');
timerText.anchor.set(1, 0);
timerText.position.set(SCREEN_W - 12, 10);
hudContainer.addChild(scoreText, timerText);

// Pause overlay
const pauseContainer = new Container();
pauseContainer.addChild(
	new Graphics().rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.6 }),
	centeredAt(createLabel('PAUSED', 44, '#ffffff'), SCREEN_W / 2, SCREEN_H / 2 - 20),
	centeredAt(createLabel('Press P to resume', 18, '#888888'), SCREEN_W / 2, SCREEN_H / 2 + 30),
);

// Game Over
const gameOverContainer = new Container();
const finalScoreText = centeredAt(createLabel('Score: 0', 28, '#ffffff'), SCREEN_W / 2, SCREEN_H / 2);
gameOverContainer.addChild(
	centeredAt(createLabel('Time\'s Up!', 44, '#ff6666'), SCREEN_W / 2, SCREEN_H / 2 - 60),
	finalScoreText,
	centeredAt(createLabel('Press SPACE to play again', 18, '#888888'), SCREEN_W / 2, SCREEN_H / 2 + 50),
);

// Add all to stage (hidden by default)
[menuContainer, hudContainer, pauseContainer, gameOverContainer].forEach(c => {
	c.visible = false;
	pixiApp.stage.addChild(c);
});

// -- Dot spawning --

function spawnDot() {
	const radius = 14 + Math.random() * 14;
	const color = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)]!;
	const x = radius + Math.random() * (SCREEN_W - radius * 2);
	const speed = 60 + Math.random() * 120;

	const gfx = new Graphics().circle(0, 0, radius).fill(color);
	const sprite = new Sprite(pixiApp.renderer.generateTexture(gfx));
	sprite.anchor.set(0.5);
	sprite.eventMode = 'static';
	sprite.cursor = 'pointer';

	// Reference to entity ID, set after spawn
	const ref = { id: -1 };

	sprite.on('pointerdown', () => {
		if (!ecs.isCurrentScreen('playing')) return;
		const state = ecs.getScreenState('playing');
		state.score += 1;
		activeDots.delete(ref.id);
		ecs.removeEntity(ref.id);
	});

	const entity = ecs.spawn({
		...createSpriteComponents(sprite, { x, y: -radius }, { anchor: { x: 0.5, y: 0.5 } }),
		dot: { lifetime: (SCREEN_H + radius * 2) / speed, speed },
	});

	ref.id = entity.id;
	activeDots.add(entity.id);
}

// -- Systems --

// Screen UI visibility — runs every frame regardless of current screen
ecs.addSystem('screenUI')
	.inPhase('render')
	.setProcess((_queries, _dt, ecs) => {
		menuContainer.visible = ecs.isCurrentScreen('menu');
		hudContainer.visible = ecs.isScreenActive('playing');
		pauseContainer.visible = ecs.isCurrentScreen('paused');
		gameOverContainer.visible = ecs.isCurrentScreen('gameOver');

		const playingState = ecs.getScreenStateOrNull('playing');
		if (playingState) {
			scoreText.text = `Score: ${playingState.score}`;
			timerText.text = `${Math.ceil(playingState.timeLeft)}`;
		}

		const gameOverState = ecs.getScreenStateOrNull('gameOver');
		if (gameOverState) {
			finalScoreText.text = `Final Score: ${gameOverState.finalScore}`;
		}
	})
	.build();

// Countdown — only runs during 'playing' screen
ecs.addSystem('countdown')
	.inScreens(['playing'])
	.setProcess((_queries, dt, ecs) => {
		const state = ecs.getScreenState('playing');
		if (state.timeLeft <= 0) return; // transition already pending
		state.timeLeft -= dt;
		if (state.timeLeft <= 0) {
			state.timeLeft = 0;
			void ecs.setScreen('gameOver', { finalScore: state.score });
		}
	})
	.build();

// Dot spawner — only runs during 'playing' screen
ecs.addSystem('dotSpawner')
	.inScreens(['playing'])
	.setProcess((_queries, dt, ecs) => {
		const state = ecs.getScreenState('playing');
		state.spawnTimer -= dt;
		if (state.spawnTimer <= 0) {
			state.spawnTimer = 0.4 + Math.random() * 0.7;
			spawnDot();
		}
	})
	.build();

// Dot movement and expiry — only runs during 'playing' screen
ecs.addSystem('dotLifecycle')
	.inScreens(['playing'])
	.addQuery('dots', { with: ['dot', 'localTransform'] })
	.setProcess((queries, dt, ecs) => {
		for (const entity of queries.dots) {
			const { dot } = entity.components;
			dot.lifetime -= dt;
			if (dot.lifetime <= 0) {
				activeDots.delete(entity.id);
				ecs.removeEntity(entity.id);
				continue;
			}
			ecs.mutateComponent(entity.id, 'localTransform', (lt) => {
				lt.y += dot.speed * dt;
			});
		}
	})
	.build();

// -- Keyboard input --

document.addEventListener('keydown', (e) => {
	if (e.code === 'Space') {
		e.preventDefault();
		if (ecs.isCurrentScreen('menu') || ecs.isCurrentScreen('gameOver')) {
			void ecs.setScreen('playing', {});
		}
	}

	if (e.code === 'KeyP' || e.code === 'Escape') {
		e.preventDefault();
		if (ecs.isCurrentScreen('playing')) {
			void ecs.pushScreen('paused', {});
		} else if (ecs.isCurrentScreen('paused')) {
			void ecs.popScreen();
		}
	}
});

// -- Start on the menu screen --

await ecs.setScreen('menu', {});
