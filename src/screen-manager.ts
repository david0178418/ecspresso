/**
 * Screen/State management for ECSpresso ECS framework
 */

import type EventBus from './event-bus';
import type AssetManager from './asset-manager';
import type ECSpresso from './ecspresso';
import type {
	ScreenDefinition,
	ScreenResource,
	ScreenEvents,
	ScreenConfigurator,
	ScreenStackEntry,
} from './screen-types';

interface ScreenEntry<Config extends Record<string, unknown>, State extends Record<string, unknown>> {
	definition: ScreenDefinition<Config, State>;
}

interface ActiveScreen<Screens extends Record<string, ScreenDefinition<any, any>>> {
	name: keyof Screens;
	config: Record<string, unknown>;
	state: Record<string, unknown>;
}

/**
 * Manages screen/state transitions for ECSpresso
 */
export default class ScreenManager<Screens extends Record<string, ScreenDefinition<any, any>> = Record<string, never>> {
	private readonly screens: Map<string, ScreenEntry<any, any>> = new Map();
	private currentScreen: ActiveScreen<Screens> | null = null;
	private screenStack: Array<ActiveScreen<Screens>> = [];

	private eventBus: EventBus<ScreenEvents> | null = null;
	private assetManager: AssetManager<any> | null = null;
	private ecs: ECSpresso<any, any, any, any, any> | null = null;

	/**
	 * Set dependencies for screen transitions
	 * @internal
	 */
	setDependencies(
		eventBus: EventBus<ScreenEvents>,
		assetManager: AssetManager<any> | null,
		ecs: ECSpresso<any, any, any, any, any>
	): void {
		this.eventBus = eventBus;
		this.assetManager = assetManager;
		this.ecs = ecs;
	}

	/**
	 * Register a screen definition
	 */
	register<K extends string, Config extends Record<string, unknown>, State extends Record<string, unknown>>(
		name: K,
		definition: ScreenDefinition<Config, State>
	): void {
		this.screens.set(name, { definition });
	}

	/**
	 * Transition to a new screen, clearing the stack
	 */
	async setScreen<K extends keyof Screens>(
		name: K,
		config: Screens[K] extends ScreenDefinition<infer C, any> ? C : never
	): Promise<void> {
		const nameStr = name as string;
		const entry = this.screens.get(nameStr);

		if (!entry) {
			throw new Error(`Screen '${nameStr}' not found`);
		}

		// Verify required assets
		await this.verifyRequiredAssets(entry.definition);

		// Exit all screens in stack (bottom to top order)
		while (this.screenStack.length > 0) {
			const stackScreen = this.screenStack.pop();
			if (stackScreen) {
				await this.exitScreen(stackScreen.name as string);
			}
		}

		// Exit current screen
		if (this.currentScreen) {
			await this.exitScreen(this.currentScreen.name as string);
		}

		// Enter new screen
		const state = entry.definition.initialState(config);
		this.currentScreen = {
			name,
			config: config as Record<string, unknown>,
			state,
		};

		await entry.definition.onEnter?.(config, this.ecs!);
		this.eventBus?.publish('screenEnter', { screen: nameStr, config });
	}

	/**
	 * Push a screen onto the stack (overlay)
	 */
	async pushScreen<K extends keyof Screens>(
		name: K,
		config: Screens[K] extends ScreenDefinition<infer C, any> ? C : never
	): Promise<void> {
		const nameStr = name as string;
		const entry = this.screens.get(nameStr);

		if (!entry) {
			throw new Error(`Screen '${nameStr}' not found`);
		}

		// Verify required assets
		await this.verifyRequiredAssets(entry.definition);

		// Push current screen to stack
		if (this.currentScreen) {
			this.screenStack.push(this.currentScreen);
		}

		// Enter new screen
		const state = entry.definition.initialState(config);
		this.currentScreen = {
			name,
			config: config as Record<string, unknown>,
			state,
		};

		await entry.definition.onEnter?.(config, this.ecs!);
		this.eventBus?.publish('screenPush', { screen: nameStr, config });
	}

	/**
	 * Pop the current screen and return to the previous one
	 */
	async popScreen(): Promise<void> {
		if (this.screenStack.length === 0) {
			throw new Error('Cannot pop screen: stack is empty');
		}

		// Exit current screen
		if (this.currentScreen) {
			const nameStr = this.currentScreen.name as string;
			await this.exitScreen(nameStr);
			this.eventBus?.publish('screenPop', { screen: nameStr });
		}

		// Restore previous screen from stack
		this.currentScreen = this.screenStack.pop() ?? null;
	}

	/**
	 * Exit a screen by name (internal helper)
	 */
	private async exitScreen(name: string): Promise<void> {
		const entry = this.screens.get(name);
		if (entry?.definition.onExit) {
			await entry.definition.onExit(this.ecs!);
		}
		this.eventBus?.publish('screenExit', { screen: name });
	}

	/**
	 * Verify required assets are loaded before screen transition
	 */
	private async verifyRequiredAssets(definition: ScreenDefinition<any, any>): Promise<void> {
		if (!this.assetManager) return;

		// Check individual required assets
		if (definition.requiredAssets) {
			for (const assetKey of definition.requiredAssets) {
				if (!this.assetManager.isLoaded(assetKey)) {
					await this.assetManager.loadAsset(assetKey);
				}
			}
		}

		// Check required asset groups
		if (definition.requiredAssetGroups) {
			for (const groupName of definition.requiredAssetGroups) {
				if (!this.assetManager.isGroupLoaded(groupName)) {
					await this.assetManager.loadAssetGroup(groupName);
				}
			}
		}
	}

	/**
	 * Get the current screen name
	 */
	getCurrentScreen(): keyof Screens | null {
		return this.currentScreen?.name ?? null;
	}

	/**
	 * Get the current screen config (immutable)
	 */
	getConfig<K extends keyof Screens>(): Screens[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never {
		if (!this.currentScreen) {
			throw new Error('No current screen');
		}
		return this.currentScreen.config as any;
	}

	/**
	 * Get the current screen config or null
	 */
	getConfigOrNull<K extends keyof Screens>(): (Screens[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never) | null {
		return (this.currentScreen?.config ?? null) as any;
	}

	/**
	 * Get the current screen state (mutable)
	 */
	getState<K extends keyof Screens>(): Screens[K] extends ScreenDefinition<any, infer S> ? S : never {
		if (!this.currentScreen) {
			throw new Error('No current screen');
		}
		return this.currentScreen.state as any;
	}

	/**
	 * Get the current screen state or null
	 */
	getStateOrNull<K extends keyof Screens>(): (Screens[K] extends ScreenDefinition<any, infer S> ? S : never) | null {
		return (this.currentScreen?.state ?? null) as any;
	}

	/**
	 * Update the current screen state
	 */
	updateState<K extends keyof Screens>(
		update: Partial<Screens[K] extends ScreenDefinition<any, infer S> ? S : never> |
			((current: Screens[K] extends ScreenDefinition<any, infer S> ? S : never) => Partial<Screens[K] extends ScreenDefinition<any, infer S> ? S : never>)
	): void {
		if (!this.currentScreen) {
			throw new Error('No current screen');
		}

		const partial = typeof update === 'function'
			? (update as (current: any) => any)(this.currentScreen.state)
			: update;

		this.currentScreen.state = {
			...this.currentScreen.state,
			...partial,
		};
	}

	/**
	 * Get the screen stack depth
	 */
	getStackDepth(): number {
		return this.screenStack.length;
	}

	/**
	 * Check if current screen is an overlay
	 */
	isOverlay(): boolean {
		return this.screenStack.length > 0;
	}

	/**
	 * Check if a screen is active (current or in stack)
	 */
	isActive(screenName: keyof Screens): boolean {
		if (this.currentScreen?.name === screenName) {
			return true;
		}
		return this.screenStack.some(s => s.name === screenName);
	}

	/**
	 * Check if a screen is the current screen
	 */
	isCurrent(screenName: keyof Screens): boolean {
		return this.currentScreen?.name === screenName;
	}

	/**
	 * Create the $screen resource object
	 */
	createResource(): ScreenResource<Screens> {
		const manager = this;
		return {
			get current(): keyof Screens | null {
				return manager.getCurrentScreen();
			},
			get config(): any {
				return manager.getConfigOrNull();
			},
			get state(): any {
				return manager.getStateOrNull();
			},
			set state(value: any) {
				if (manager.currentScreen) {
					manager.currentScreen.state = value;
				}
			},
			get stack(): ReadonlyArray<ScreenStackEntry<Screens>> {
				return manager.screenStack as unknown as ReadonlyArray<ScreenStackEntry<Screens>>;
			},
			get isOverlay(): boolean {
				return manager.isOverlay();
			},
			get stackDepth(): number {
				return manager.getStackDepth();
			},
			isActive(screenName: keyof Screens): boolean {
				return manager.isActive(screenName);
			},
			isCurrent(screenName: keyof Screens): boolean {
				return manager.isCurrent(screenName);
			},
		};
	}

	/**
	 * Get all registered screen names
	 */
	getScreenNames(): Array<keyof Screens> {
		return Array.from(this.screens.keys()) as Array<keyof Screens>;
	}

	/**
	 * Check if a screen is registered
	 */
	hasScreen(name: keyof Screens): boolean {
		return this.screens.has(name as string);
	}
}

/**
 * Implementation of ScreenConfigurator for builder pattern
 */
export class ScreenConfiguratorImpl<Screens extends Record<string, ScreenDefinition<any, any>>> implements ScreenConfigurator<Screens> {
	private readonly manager: ScreenManager<Screens>;

	constructor(manager: ScreenManager<Screens>) {
		this.manager = manager;
	}

	add<K extends string, Config extends Record<string, unknown>, State extends Record<string, unknown>>(
		name: K,
		definition: ScreenDefinition<Config, State>
	): ScreenConfigurator<Screens & Record<K, ScreenDefinition<Config, State>>> {
		this.manager.register(name, definition);
		return this as unknown as ScreenConfigurator<Screens & Record<K, ScreenDefinition<Config, State>>>;
	}

	/**
	 * Get the underlying manager
	 * @internal
	 */
	getManager(): ScreenManager<Screens> {
		return this.manager;
	}
}

/**
 * Create a new ScreenConfigurator for builder pattern usage
 */
export function createScreenConfigurator<Screens extends Record<string, ScreenDefinition<any, any>> = Record<string, never>>(
	manager?: ScreenManager<Screens>
): ScreenConfiguratorImpl<Screens> {
	return new ScreenConfiguratorImpl(manager ?? new ScreenManager<Screens>());
}
