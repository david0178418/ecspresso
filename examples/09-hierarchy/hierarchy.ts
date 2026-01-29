import { Application, Container, Graphics } from 'pixi.js';
import ECSpresso from "../../src";

// ==================== Type Definitions ====================

interface Components {
	/** World position (computed from parent chain + localPosition) */
	position: { x: number; y: number };
	/** Position relative to parent (or world if no parent) */
	localPosition: { x: number; y: number };
	/** Orbital parameters for bodies that orbit a parent */
	orbit: { radius: number; speed: number; angle: number };
	/** Visual properties of the celestial body */
	celestialBody: { name: string; color: number; radius: number };
	/** PixiJS graphics object for rendering */
	graphics: Graphics;
}

interface Events {
	hierarchyChanged: { entityId: number; oldParent: number | null; newParent: number | null };
	bodyDestroyed: { name: string; childCount: number };
}

interface Resources {
	pixi: Application;
	worldContainer: Container;
	camera: { x: number; y: number };
	keys: { up: boolean; down: boolean; left: boolean; right: boolean };
}

// ==================== Solar System Data ====================

const SOLAR_SYSTEM = {
	sun: {
		name: 'Sun',
		color: 0xFFD700,
		radius: 35,
	},
	planets: [
		{
			name: 'Mercury',
			color: 0xB0B0B0,
			radius: 6,
			orbitRadius: 70,
			orbitSpeed: 0.8,
			moons: [],
		},
		{
			name: 'Venus',
			color: 0xE6B800,
			radius: 9,
			orbitRadius: 100,
			orbitSpeed: 0.6,
			moons: [],
		},
		{
			name: 'Earth',
			color: 0x4169E1,
			radius: 10,
			orbitRadius: 140,
			orbitSpeed: 0.4,
			moons: [
				{ name: 'Moon', color: 0xC0C0C0, radius: 4, orbitRadius: 20, orbitSpeed: 1.2 },
			],
		},
		{
			name: 'Mars',
			color: 0xCD5C5C,
			radius: 8,
			orbitRadius: 185,
			orbitSpeed: 0.3,
			moons: [
				{ name: 'Phobos', color: 0x8B8B83, radius: 3, orbitRadius: 15, orbitSpeed: 1.5 },
				{ name: 'Deimos', color: 0x9C9C8B, radius: 2, orbitRadius: 22, orbitSpeed: 1.2 },
			],
		},
		{
			name: 'Jupiter',
			color: 0xDAA520,
			radius: 22,
			orbitRadius: 260,
			orbitSpeed: 0.18,
			moons: [
				{ name: 'Io', color: 0xFFFF66, radius: 4, orbitRadius: 32, orbitSpeed: 1.3 },
				{ name: 'Europa', color: 0xADD8E6, radius: 4, orbitRadius: 40, orbitSpeed: 1.0 },
				{ name: 'Ganymede', color: 0xC0C0C0, radius: 5, orbitRadius: 50, orbitSpeed: 0.7 },
				{ name: 'Callisto', color: 0x808080, radius: 5, orbitRadius: 60, orbitSpeed: 0.5 },
			],
		},
		{
			name: 'Saturn',
			color: 0xF4C542,
			radius: 18,
			orbitRadius: 350,
			orbitSpeed: 0.12,
			moons: [
				{ name: 'Titan', color: 0xD2691E, radius: 5, orbitRadius: 35, orbitSpeed: 0.7 },
				{ name: 'Enceladus', color: 0xFFFFFF, radius: 3, orbitRadius: 28, orbitSpeed: 1.1 },
			],
		},
	],
};

// ==================== ECS Setup ====================

const ecs = ECSpresso.create<Components, Events, Resources>().build();

ecs
	.addResource('pixi', async () => {
		const pixi = new Application();
		await pixi.init({
			background: 0x000011,
			resizeTo: window,
		});
		return pixi;
	})
	// ==================== Orbit System ====================
	// Updates localPosition based on orbital angle and radius
	.addSystem('orbit')
	.addQuery('orbitingBodies', {
		with: ['orbit', 'localPosition'],
	})
	.setProcess((queries, deltaTime) => {
		for (const entity of queries.orbitingBodies) {
			const { orbit, localPosition } = entity.components;

			// Update orbital angle
			orbit.angle += orbit.speed * deltaTime;

			// Compute local position from orbit
			localPosition.x = Math.cos(orbit.angle) * orbit.radius;
			localPosition.y = Math.sin(orbit.angle) * orbit.radius;
		}
	})
	.and()
	// ==================== World Position System ====================
	// Computes world position from parent's world position + local position
	.addSystem('world-position')
	.addQuery('positionedBodies', {
		with: ['position', 'localPosition'],
	})
	.setProcess((queries, _deltaTime, ecs) => {
		for (const entity of queries.positionedBodies) {
			const { position, localPosition } = entity.components;

			// Start with local position
			let worldX = localPosition.x;
			let worldY = localPosition.y;

			// Add parent's world position (which already includes all grandparent positions)
			const parentId = ecs.getParent(entity.id);
			if (parentId !== null) {
				const parentPos = ecs.entityManager.getComponent(parentId, 'position');
				if (parentPos) {
					worldX += parentPos.x;
					worldY += parentPos.y;
				}
			}

			// Update world position
			position.x = worldX;
			position.y = worldY;
		}
	})
	.and()
	// ==================== Render System ====================
	// Updates graphics positions from world positions
	.addSystem('render')
	.addQuery('renderableBodies', {
		with: ['graphics', 'position'],
	})
	.setProcess((queries) => {
		for (const entity of queries.renderableBodies) {
			const { graphics, position } = entity.components;
			graphics.position.set(position.x, position.y);
		}
	})
	.and()
	// ==================== Camera System ====================
	// Scrolls the view based on keyboard input
	.addSystem('camera')
	.setProcess((_queries, deltaTime, ecs) => {
		const keys = ecs.getResource('keys');
		const camera = ecs.getResource('camera');
		const worldContainer = ecs.getResource('worldContainer');

		const scrollSpeed = 400;

		if (keys.up) camera.y += scrollSpeed * deltaTime;
		if (keys.down) camera.y -= scrollSpeed * deltaTime;
		if (keys.left) camera.x += scrollSpeed * deltaTime;
		if (keys.right) camera.x -= scrollSpeed * deltaTime;

		worldContainer.position.set(camera.x, camera.y);
	})
	.and()
	// ==================== Initialize System ====================
	.addSystem('initialize')
	.setOnInitialize(async (ecs) => {
		const pixi = ecs.getResource('pixi');

		// Create world container now that pixi is ready
		const worldContainer = new Container();
		pixi.stage.addChild(worldContainer);
		ecs.addResource('worldContainer', worldContainer);

		// Initialize camera at origin
		ecs.addResource('camera', { x: 0, y: 0 });

		// Set up keyboard input
		const keys = { up: false, down: false, left: false, right: false };
		ecs.addResource('keys', keys);
		setupKeyboardInput(keys);

		// Add reactive query to auto-update hierarchy display
		ecs.addReactiveQuery('celestialBodies', {
			with: ['celestialBody'],
			onEnter: () => updateHierarchyDisplay(ecs),
			onExit: () => updateHierarchyDisplay(ecs),
		});

		// Append canvas to body
		document.body.appendChild(pixi.canvas);

		const centerX = pixi.screen.width / 2;
		const centerY = pixi.screen.height / 2;

		// Create the sun (root entity)
		const sunGraphics = createCelestialGraphics(SOLAR_SYSTEM.sun.color, SOLAR_SYSTEM.sun.radius);
		worldContainer.addChild(sunGraphics);

		const sun = ecs.spawn({
			position: { x: centerX, y: centerY },
			localPosition: { x: centerX, y: centerY },
			celestialBody: { ...SOLAR_SYSTEM.sun },
			graphics: sunGraphics,
		});

		// Register click handler for sun
		registerClickHandler(sunGraphics, sun.id, ecs);

		// Create planets as children of sun
		for (const planetData of SOLAR_SYSTEM.planets) {
			const planetGraphics = createCelestialGraphics(planetData.color, planetData.radius);
			worldContainer.addChild(planetGraphics);

			const planet = ecs.spawnChild(sun.id, {
				position: { x: 0, y: 0 },
				localPosition: { x: 0, y: 0 },
				orbit: {
					radius: planetData.orbitRadius,
					speed: planetData.orbitSpeed,
					angle: Math.random() * Math.PI * 2,
				},
				celestialBody: {
					name: planetData.name,
					color: planetData.color,
					radius: planetData.radius,
				},
				graphics: planetGraphics,
			});

			registerClickHandler(planetGraphics, planet.id, ecs);

			// Create moons as children of planet
			for (const moonData of planetData.moons) {
				const moonGraphics = createCelestialGraphics(moonData.color, moonData.radius);
				worldContainer.addChild(moonGraphics);

				const moon = ecs.spawnChild(planet.id, {
					position: { x: 0, y: 0 },
					localPosition: { x: 0, y: 0 },
					orbit: {
						radius: moonData.orbitRadius,
						speed: moonData.orbitSpeed,
						angle: Math.random() * Math.PI * 2,
					},
					celestialBody: {
						name: moonData.name,
						color: moonData.color,
						radius: moonData.radius,
					},
					graphics: moonGraphics,
				});

				registerClickHandler(moonGraphics, moon.id, ecs);
			}
		}

		// Start the game loop
		pixi.ticker.add((ticker) => {
			ecs.update(ticker.deltaMS / 1000);
		});
	})
	.build();

// ==================== Helper Functions ====================

type KeyDirection = 'up' | 'down' | 'left' | 'right';

const keyToDirection: Record<string, KeyDirection> = {
	'ArrowUp': 'up',
	'w': 'up',
	'W': 'up',
	'ArrowDown': 'down',
	's': 'down',
	'S': 'down',
	'ArrowLeft': 'left',
	'a': 'left',
	'A': 'left',
	'ArrowRight': 'right',
	'd': 'right',
	'D': 'right',
};

function setupKeyboardInput(keys: { up: boolean; down: boolean; left: boolean; right: boolean }): void {
	window.addEventListener('keydown', (e) => {
		const direction = keyToDirection[e.key];
		if (direction) keys[direction] = true;
	});

	window.addEventListener('keyup', (e) => {
		const direction = keyToDirection[e.key];
		if (direction) keys[direction] = false;
	});
}

function createCelestialGraphics(color: number, radius: number): Graphics {
	const graphics = new Graphics();

	// Draw invisible hit area for small bodies (minimum 15px radius for easier clicking)
	const hitRadius = Math.max(radius, 15);
	if (hitRadius > radius) {
		graphics.circle(0, 0, hitRadius);
		graphics.fill({ color: 0x000000, alpha: 0 });
	}

	// Draw the visible body
	graphics.circle(0, 0, radius);
	graphics.fill(color);

	// Add glow effect for larger bodies
	if (radius > 15) {
		graphics.circle(0, 0, radius + 5);
		graphics.fill({ color, alpha: 0.3 });
	}

	graphics.eventMode = 'static';
	graphics.cursor = 'pointer';

	return graphics;
}

function registerClickHandler(
	graphics: Graphics,
	entityId: number,
	ecs: ECSpresso<Components, Events, Resources>
): void {
	graphics.on('pointerdown', () => {
		const celestialBody = ecs.entityManager.getComponent(entityId, 'celestialBody');
		if (!celestialBody) return;

		const descendants = ecs.getDescendants(entityId);

		// Publish destruction event
		ecs.eventBus.publish('bodyDestroyed', {
			name: celestialBody.name,
			childCount: descendants.length,
		});

		// Destroy graphics for this entity and all descendants
		const entitiesToDestroy = [entityId, ...descendants];
		for (const id of entitiesToDestroy) {
			const g = ecs.entityManager.getComponent(id, 'graphics');
			if (g) {
				g.destroy();
			}
		}

		// Remove entity (cascade: true by default removes all children)
		ecs.removeEntity(entityId);

		console.log(`Destroyed ${celestialBody.name} and ${descendants.length} descendants`);
	});
}

function centerOnEntity(entityId: number, ecs: ECSpresso<Components, Events, Resources>): void {
	const position = ecs.entityManager.getComponent(entityId, 'position');
	if (!position) return;

	const pixi = ecs.getResource('pixi');
	const camera = ecs.getResource('camera');

	// Center the camera on the entity
	camera.x = pixi.screen.width / 2 - position.x;
	camera.y = pixi.screen.height / 2 - position.y;
}

function updateHierarchyDisplay(ecs: ECSpresso<Components, Events, Resources>): void {
	const treeEl = document.getElementById('hierarchy-tree');
	if (!treeEl) return;

	// Clear existing content
	treeEl.innerHTML = '';

	const roots = ecs.getRootEntities();

	if (roots.length === 0) {
		const bodies = ecs.getEntitiesWithQuery(['celestialBody']);
		if (bodies.length === 0) {
			treeEl.textContent = '(empty - all bodies destroyed)';
		} else {
			for (const body of bodies) {
				const item = createTreeItem(body.id, body.components.celestialBody.name, 0, ecs);
				treeEl.appendChild(item);
			}
		}
		return;
	}

	for (const rootId of roots) {
		buildTreeNodes(rootId, 0, treeEl, ecs);
	}
}

function createTreeItem(
	entityId: number,
	name: string,
	depth: number,
	ecs: ECSpresso<Components, Events, Resources>
): HTMLElement {
	const item = document.createElement('div');
	item.style.paddingLeft = `${depth * 16}px`;
	item.style.cursor = 'pointer';
	item.style.padding = '2px 4px';
	item.style.paddingLeft = `${depth * 16 + 4}px`;

	const prefix = depth === 0 ? '' : '- ';
	item.textContent = `${prefix}${name}`;

	item.addEventListener('mouseenter', () => {
		item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
	});
	item.addEventListener('mouseleave', () => {
		item.style.backgroundColor = 'transparent';
	});
	item.addEventListener('click', () => {
		centerOnEntity(entityId, ecs);
	});

	return item;
}

function buildTreeNodes(
	entityId: number,
	depth: number,
	container: HTMLElement,
	ecs: ECSpresso<Components, Events, Resources>
): void {
	const celestialBody = ecs.entityManager.getComponent(entityId, 'celestialBody');
	if (!celestialBody) return;

	const item = createTreeItem(entityId, celestialBody.name, depth, ecs);
	container.appendChild(item);

	const children = ecs.getChildren(entityId);
	for (const childId of children) {
		buildTreeNodes(childId, depth + 1, container, ecs);
	}
}

// ==================== Event Handlers ====================

ecs.on('bodyDestroyed', (data) => {
	const infoPanel = document.getElementById('info-panel');
	if (infoPanel) {
		const childText = data.childCount > 0
			? ` and ${data.childCount} child${data.childCount > 1 ? 'ren' : ''}`
			: '';
		infoPanel.textContent = `Destroyed ${data.name}${childText}. WASD/Arrows to scroll, click to destroy.`;
	}
});

ecs.on('hierarchyChanged', (data) => {
	console.log('Hierarchy changed:', data);
});

// ==================== Start ====================

await ecs.initialize();
