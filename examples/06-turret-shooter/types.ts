import {
	Object3D,
	Scene,
	PerspectiveCamera,
	WebGLRenderer,
	Vector3
} from 'three';

/**
 * All component types used in the 3D Turret Shooter game
 */
export interface Components {
	// 3D position, rotation and scale
	position: {
		x: number;
		y: number;
		z: number;
	};
	rotation: {
		x: number;
		y: number;
		z: number;
	};
	scale: {
		x: number;
		y: number;
		z: number;
	};

	// 3D velocity and movement
	velocity: {
		x: number;
		y: number;
		z: number;
	};

	// 3D model/mesh
	model: Object3D;

	// Game object types
	player: {
		health: number;
		maxHealth: number;
		lastShotTime: number;
		fireRate: number; // shots per second
	};
	enemy: {
		type: 'ground' | 'air';
		health: number;
		speed: number;
		attackDamage: number;
		scoreValue: number;
		isDestroying?: boolean; // Flag to track if enemy is already being destroyed
	};
	projectile: {
		owner: 'player';
		damage: number;
		speed: number;
	};

	// Collisions
	collider: {
		radius: number; // Simple sphere collider
	};

	// Additional components
	lifetime: {
		remaining: number;
	};
	radarBlip: {
		type: 'ground' | 'air';
		distance: number;
		angle: number;
	};
}

/**
 * All event types used in the 3D Turret Shooter game
 */
export interface Events {
	// Game state events
	gameInit: true;
	gameStart: true;
	gamePause: true;
	gameResume: true;
	gameOver: {
		win: boolean;
		score: number;
	};
	waveComplete: {
		wave: number;
	};

	// Input events
	inputMouseMove: {
		x: number;
		y: number;
	};
	inputMouseDown: {
		button: number;
	};
	inputMouseUp: {
		button: number;
	};
	inputKeyDown: {
		key: string;
	};
	inputKeyUp: {
		key: string;
	};

	// Gameplay events
	playerShoot: {
		direction: Vector3;
	};
	playerHit: {
		damage: number;
	};
	enemySpawn: {
		type: 'ground' | 'air';
		position: Vector3;
	};
	enemyDestroyed: {
		entityId: number;
		points: number;
	};
	entityDestroyed: {
		entityId: number;
	};

	// UI events
	updateScore: {
		points: number;
	};
	updateHealth: {
		health: number;
	};
	updateWave: {
		wave: number;
	};
}

/**
 * All resource types used in the 3D Turret Shooter game
 */
export interface Resources {
	// Three.js resources
	renderer: WebGLRenderer;
	scene: Scene;
	camera: PerspectiveCamera;

	// Game state
	gameState: {
		status: 'ready' | 'playing' | 'paused' | 'gameOver';
		wave: number;
		score: number;
	};

	// Player input
	input: {
		mousePosition: {
			x: number;
			y: number;
		};
		mouseButtons: {
			left: boolean;
			right: boolean;
			middle: boolean;
		};
		keys: Record<string, boolean>;
	};

	// Game configuration
	config: {
		playerFireRate: number;
		playerProjectileSpeed: number;
		playerProjectileDamage: number;
		maxEnemies: number;
		enemySpawnRate: number; // enemies per second
		waveCount: number;
		enemiesPerWave: number;
	};

	// Game assets
	assets: {
		models: Record<string, Object3D>;
		textures: Record<string, any>;
	};

	// Wave management
	waveManager: {
		currentWave: number;
		enemiesRemaining: number;
		lastSpawnTime: number;
		waveStartTime: number;
	};

	// UI elements
	uiElements: {
		scoreElement: HTMLElement | null;
		healthElement: HTMLElement | null;
		waveElement: HTMLElement | null;
		messageElement: HTMLElement | null;
		radarElement: HTMLElement | null;
	};

	// Radar system
	radar: {
		range: number; // Maximum radar detection range
		updateFrequency: number; // How often (in seconds) the radar updates
		lastUpdateTime: number;
	};

	// Player initial rotation (for enemy spawn direction)
	playerInitialRotation: {
		y: number; // Initial horizontal rotation angle
	};

	// Event listeners (for cleanup)
	eventListeners: {
		mousemove: (event: MouseEvent) => void;
		mousedown: (event: MouseEvent) => void;
		mouseup: (event: MouseEvent) => void;
		keydown: (event: KeyboardEvent) => void;
		keyup: (event: KeyboardEvent) => void;
		contextmenu: (event: MouseEvent) => void;
	};
}
