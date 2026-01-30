import type ECSpresso from './ecspresso';
import type { RemoveEntityOptions } from './types';

/**
 * CommandBuffer queues structural changes to be executed later.
 * This prevents ordering issues when modifying entities during system execution.
 *
 * Commands are executed in FIFO order when playback() is called.
 *
 * @example
 * ```typescript
 * // In a system
 * ecs.commands.removeEntity(entityId);
 * ecs.commands.spawn({ position: { x: 0, y: 0 } });
 *
 * // Later (automatically at end of update())
 * ecs.commands.playback(ecs);
 * ```
 */
export default class CommandBuffer<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {}
> {
	private commands: Array<(ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, any, any>) => void> = [];

	/**
	 * Queue an entity removal command
	 * @param entityId The ID of the entity to remove
	 * @param options Optional removal options (cascade, etc.)
	 */
	removeEntity(entityId: number, options?: RemoveEntityOptions): void {
		this.commands.push((ecs) => {
			ecs.removeEntity(entityId, options);
		});
	}

	/**
	 * Queue a component addition command
	 * @param entityId The ID of the entity
	 * @param componentName The name of the component to add
	 * @param componentValue The component data
	 */
	addComponent<K extends keyof ComponentTypes>(
		entityId: number,
		componentName: K,
		componentValue: ComponentTypes[K]
	): void {
		this.commands.push((ecs) => {
			ecs.entityManager.addComponent(entityId, componentName, componentValue);
		});
	}

	/**
	 * Queue a component removal command
	 * @param entityId The ID of the entity
	 * @param componentName The name of the component to remove
	 */
	removeComponent<K extends keyof ComponentTypes>(
		entityId: number,
		componentName: K
	): void {
		this.commands.push((ecs) => {
			ecs.entityManager.removeComponent(entityId, componentName);
		});
	}

	/**
	 * Queue an entity spawn command
	 * @param components The initial components for the new entity
	 * @returns void (entity ID not available until playback)
	 */
	spawn<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): void {
		this.commands.push((ecs) => {
			ecs.spawn(components);
		});
	}

	/**
	 * Queue a child entity spawn command
	 * @param parentId The ID of the parent entity
	 * @param components The initial components for the new child entity
	 */
	spawnChild<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		parentId: number,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): void {
		this.commands.push((ecs) => {
			ecs.spawnChild(parentId, components);
		});
	}

	/**
	 * Queue multiple component additions
	 * @param entityId The ID of the entity
	 * @param components Object with component names as keys and component data as values
	 */
	addComponents<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		entityId: number,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): void {
		this.commands.push((ecs) => {
			ecs.entityManager.addComponents(entityId, components);
		});
	}

	/**
	 * Queue a parent assignment command
	 * @param childId The ID of the child entity
	 * @param parentId The ID of the parent entity
	 */
	setParent(childId: number, parentId: number): void {
		this.commands.push((ecs) => {
			ecs.setParent(childId, parentId);
		});
	}

	/**
	 * Queue a markChanged command
	 * @param entityId The ID of the entity
	 * @param componentName The component to mark as changed
	 */
	markChanged<K extends keyof ComponentTypes>(entityId: number, componentName: K): void {
		this.commands.push((ecs) => {
			ecs.markChanged(entityId, componentName);
		});
	}

	/**
	 * Queue a parent removal command
	 * @param childId The ID of the child entity
	 */
	removeParent(childId: number): void {
		this.commands.push((ecs) => {
			ecs.removeParent(childId);
		});
	}

	/**
	 * Execute all queued commands in FIFO order.
	 * Errors from individual commands are caught and logged, but do not stop playback.
	 * @param ecs The ECSpresso instance to execute commands on
	 */
	playback<AssetTypes extends Record<string, any> = {}, ScreenStates extends Record<string, any> = {}>(
		ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
	): void {
		// Execute all commands, catching errors to prevent one bad command from stopping all playback
		for (const command of this.commands) {
			try {
				command(ecs);
			} catch (error) {
				// Log error but continue with remaining commands
				// This matches Unity DOTS behavior where invalid commands are silently skipped
				console.warn('CommandBuffer: Command failed during playback:', error);
			}
		}

		// Clear the queue
		this.commands = [];
	}

	/**
	 * Clear all queued commands without executing them
	 */
	clear(): void {
		this.commands = [];
	}

	/**
	 * Get the number of queued commands
	 * @returns The number of commands waiting to be executed
	 */
	get length(): number {
		return this.commands.length;
	}
}
