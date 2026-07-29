import type { SystemBuilder } from './system-builder';
import type {
	AnyECSpresso,
	ConfigOf,
	EmptyConfig,
	WorldConfig,
} from './type-utils';
import type { SystemPhase } from './types';

/**
 * Defaults applied to every system created through a plugin installation or
 * a system registration scope. Registration scopes snapshot these values;
 * per-system builder calls override them.
 */
export interface SystemDefaults<
	Cfg extends WorldConfig = EmptyConfig,
> {
	inScreens?: ReadonlyArray<keyof Cfg['screens'] & string>;
	excludeScreens?: ReadonlyArray<keyof Cfg['screens'] & string>;
	phase?: SystemPhase;
	priority?: number;
}

/**
 * Narrow capability for application modules that only register systems.
 */
export interface SystemRegistrar<
	Cfg extends WorldConfig = EmptyConfig,
> {
	addSystem(label: string): SystemBuilder<Cfg>;
}

/**
 * Extract a system registrar with the complete configuration of a built world.
 */
export type SystemRegistrarOf<W extends AnyECSpresso> =
	SystemRegistrar<ConfigOf<W>>;
