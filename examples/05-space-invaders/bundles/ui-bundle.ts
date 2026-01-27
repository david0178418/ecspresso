import { Text, TextStyle } from 'pixi.js';
import Bundle from '../../../src/bundle';
import { createTimer } from '../../../src/bundles/utils/timers';
import type { Components, Events, Resources } from '../types';

export default function createUIBundle() {
	return new Bundle<Components, Events, Resources>('ui-bundle')
		.addSystem('ui-manager')
		.setOnInitialize((ecs) => {
			const uiContainer = ecs.getResource('uiContainer');
			const pixi = ecs.getResource('pixi');

			const scoreText = new Text({
				x: 0,
				y: 0,
				text: 'Score: 0',
				style: new TextStyle({
					fontFamily: 'Arial',
					fontSize: 24,
					fontWeight: 'bold',
					fill: '#FFFFFF',
				}),
			});

			const livesText = new Text({
				x: pixi.screen.width - 120,
				y: 20,
				text: 'Lives: 3',
				style: new TextStyle({
					fontFamily: 'Arial',
					fontSize: 24,
					fontWeight: 'bold',
					fill: '#00FF00',
				}),
			});

			const messageText = new Text({
				text: 'SPACE INVADERS',
				style: new TextStyle({
					fontFamily: 'Arial',
					fontSize: 36,
					fontWeight: 'bold',
					fill: '#FFFFFF',
				})
			});
			messageText.x = (pixi.screen.width - messageText.width) / 2;
			messageText.y = pixi.screen.height / 2 - 50;

			// Add texts to the UI container
			uiContainer.addChild(scoreText);
			uiContainer.addChild(livesText);
			uiContainer.addChild(messageText);

			// Store UI elements in resources
			ecs.addResource('uiElements', {
				scoreText,
				livesText,
				messageText
			});
		})
		.setEventHandlers({
			// Update score display
			updateScore: {
				handler(data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					uiElements.scoreText.text = `Score: ${data.points}`;
				}
			},

			// Update lives display
			updateLives: {
				handler(data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					uiElements.livesText.text = `Lives: ${data.lives}`;
				}
			},

			// Handle game state changes
			gameInit: {
				handler(_data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					const pixi = ecs.getResource('pixi');

					uiElements.messageText.text = 'PRESS P TO START';
					uiElements.messageText.x = (pixi.screen.width - uiElements.messageText.width) / 2;
					uiElements.messageText.y = pixi.screen.height / 2 - 50;
					uiElements.messageText.visible = true;
				}
			},

			gameStart: {
				handler(_data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					uiElements.messageText.visible = false;
				}
			},

			gamePause: {
				handler(_data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					const pixi = ecs.getResource('pixi');

					uiElements.messageText.text = 'PAUSED';
					uiElements.messageText.x = (pixi.screen.width - uiElements.messageText.width) / 2;
					uiElements.messageText.y = pixi.screen.height / 2 - 50;
					uiElements.messageText.visible = true;
				}
			},

			gameResume: {
				handler(_data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					uiElements.messageText.visible = false;
				}
			},

			gameOver: {
				handler(data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					const pixi = ecs.getResource('pixi');

					uiElements.messageText.text = data.win
						? `YOU WIN!\nFINAL SCORE: ${data.score}`
						: `GAME OVER\nFINAL SCORE: ${data.score}`;

					uiElements.messageText.x = (pixi.screen.width - uiElements.messageText.width) / 2;
					uiElements.messageText.y = pixi.screen.height / 2 - 50;
					uiElements.messageText.visible = true;
				}
			},

			levelComplete: {
				handler(data, ecs) {
					const uiElements = ecs.getResource('uiElements');
					const pixi = ecs.getResource('pixi');

					uiElements.messageText.text = `LEVEL ${data.level} COMPLETE!`;
					uiElements.messageText.x = (pixi.screen.width - uiElements.messageText.width) / 2;
					uiElements.messageText.y = pixi.screen.height / 2 - 50;
					uiElements.messageText.visible = true;

					// Spawn timer to hide message after delay
					ecs.spawn({
						...createTimer(1.5),
						messageHideTimer: true as const,
					});
				}
			}
		})
		.bundle
		// Message hide timer system
		.addSystem('message-hide-timer')
		.addQuery('messageHideTimers', {
			with: ['timer', 'messageHideTimer'] as const,
		})
		.setProcess(({ messageHideTimers }, _deltaTime, ecs) => {
			for (const entity of messageHideTimers) {
				if (entity.components.timer.justFinished) {
					// Remove the timer entity
					ecs.removeEntity(entity.id);

					// Hide message if game is still playing
					const gameState = ecs.getResource('gameState');
					if (gameState.status === 'playing') {
						const uiElements = ecs.getResource('uiElements');
						uiElements.messageText.visible = false;
					}
				}
			}
		})
		.bundle;
}
