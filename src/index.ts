import ECSpresso from './ecspresso';
import { SystemBuilder, type ProcessContext } from './system-builder';
import { type Plugin, type BasePluginOptions, type PluginCleanupRegistrar, definePlugin } from './plugin';

export * from './types';
export * from './asset-types';
export * from './screen-types';
export * from './utils/math';
export type { ReactiveQueryDefinition } from './reactive-query-manager';
export { default as AssetManager, createAssetConfigurator } from './asset-manager';
export { default as ScreenManager, createScreenConfigurator } from './screen-manager';
export { SystemBuilder, type ProcessContext };
export { type Plugin, type BasePluginOptions, type PluginCleanupRegistrar, definePlugin };
export { directValue, type ResourceDirectValue } from './resource-manager';
export default ECSpresso;
