import ECSpresso from './ecspresso';
import { SystemBuilder } from './system-builder';
import { type Plugin, definePlugin } from './plugin';

export * from './types';
export * from './asset-types';
export * from './screen-types';
export * from './utils/math';
export type { ReactiveQueryDefinition } from './reactive-query-manager';
export { default as AssetManager, createAssetConfigurator } from './asset-manager';
export { default as ScreenManager, createScreenConfigurator } from './screen-manager';
export { SystemBuilder };
export { type Plugin, definePlugin };
export default ECSpresso;
