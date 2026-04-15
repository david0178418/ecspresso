/**
 * React bindings for ECSpresso
 *
 * Provides a context provider and typed hooks for bridging ECS state
 * into React component trees. No ECS-side systems or components —
 * purely a consumer of the existing public API.
 *
 * Import from 'ecspresso/bindings/react'
 *
 * @example
 * ```tsx
 * import { EcsContext, createEcsHooks } from 'ecspresso/bindings/react';
 *
 * const { useResource, useEvent, useEcs } = createEcsHooks<typeof ecs>();
 *
 * function HUD() {
 *   const score = useResource('score');
 *   return <div>Score: {score}</div>;
 * }
 *
 * createRoot(root).render(
 *   <EcsContext.Provider value={ecs}>
 *     <HUD />
 *   </EcsContext.Provider>
 * );
 * ```
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type ECSpresso from 'ecspresso';

/**
 * React context for providing the ECS instance to the component tree.
 * Wrap your UI root with `<EcsContext.Provider value={ecs}>`.
 */
const EcsContext = createContext<ECSpresso<any> | null>(null);

export { EcsContext };

/**
 * Creates typed hooks bound to a specific world config.
 *
 * Call once at module scope with your world type, then use the
 * returned hooks in components anywhere under the `EcsContext.Provider`.
 *
 * @example
 * ```tsx
 * const ecs = ECSpresso.create()
 *   .withResourceTypes<{ score: number; health: number }>()
 *   .withEventTypes<{ enemyKilled: { id: number } }>()
 *   .build();
 *
 * type ECS = typeof ecs;
 * const { useResource, useEvent, useEcs } = createEcsHooks<ECS>();
 * ```
 */
export function createEcsHooks<W extends ECSpresso<any>>() {
	type Resources = W['_cfg']['resources'];
	type Events = W['_cfg']['events'];

	/**
	 * Access the typed ECS instance from context.
	 * Useful for calling `setResource`, `spawn`, etc. from event handlers.
	 */
	function useEcs(): W {
		const ecs = useContext(EcsContext);
		if (!ecs) throw new Error('useEcs: missing EcsContext.Provider');
		return ecs as W;
	}

	/**
	 * Subscribe to a resource value. Re-renders when the resource changes.
	 *
	 * Uses `onResourceChange` under the hood — the resource is automatically
	 * marked as "observed" so systems re-resolve it each frame and in-place
	 * mutations are detected via shallow diff.
	 */
	function useResource<K extends keyof Resources & string>(key: K): Resources[K] {
		const ecs = useEcs();
		const [value, setValue] = useState<Resources[K]>(() => ecs.getResource(key));

		useEffect(() => {
			return ecs.onResourceChange(key, (next: Resources[K]) => {
				setValue(next);
			});
		}, [key]);

		return value;
	}

	/**
	 * Subscribe to an event. The callback fires whenever the event is published.
	 *
	 * Does not trigger re-renders — use for side effects like showing
	 * toast notifications, playing sounds, or appending to a log.
	 * The callback ref is kept current so closures always see latest state.
	 */
	function useEvent<E extends keyof Events & string>(
		type: E,
		callback: (data: Events[E]) => void,
	): void {
		const ecs = useEcs();
		const ref = useRef(callback);
		ref.current = callback;

		useEffect(() => {
			return ecs.eventBus.subscribe(type, (data: Events[E]) => {
				ref.current(data);
			});
		}, [type]);
	}

	return { useEcs, useResource, useEvent } as const;
}
