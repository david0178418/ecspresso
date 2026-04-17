/**
 * Tilemap plugin for ECSpresso.
 *
 * Two ingestion paths share a common `LoadedTilemap` shape:
 * - `registerAsset` — load a Tiled `.tmj` file via the asset manager
 * - `registerRuntime` — pass a pre-built tile-id array (procedural)
 *
 * Query methods (`isSolid`, `isOpaque`, `isWalkable`) read from `tileMetadata`
 * regardless of source.
 */

import { definePlugin, type BasePluginOptions } from 'ecspresso';
import type ECSpresso from 'ecspresso';
import type { WorldConfigFrom, EmptyConfig } from '../../type-utils';
import { createNavGrid, type NavGrid } from '../ai/pathfinding';
import type { Vector2D } from '../../utils/math';
import type { LocalTransform, WorldTransform } from '../spatial/transform';
import type { AABBCollider, CollisionLayer } from '../physics/collision';

export const TILE_FLIP_HORIZONTAL = 0x80000000;
export const TILE_FLIP_VERTICAL = 0x40000000;
export const TILE_FLIP_DIAGONAL = 0x20000000;
export const TILE_GID_MASK = 0x1fffffff;

export interface DecodedGid {
	id: number;
	flipH: boolean;
	flipV: boolean;
	flipD: boolean;
}

export function decodeGid(gid: number): DecodedGid {
	return {
		id: (gid & TILE_GID_MASK) >>> 0,
		flipH: (gid & TILE_FLIP_HORIZONTAL) !== 0,
		flipV: (gid & TILE_FLIP_VERTICAL) !== 0,
		flipD: (gid & TILE_FLIP_DIAGONAL) !== 0,
	};
}

/** The three tile flag keys the query API understands. Custom keys flow through unchanged. */
export type TileFlag = 'solid' | 'blocksSight' | 'walkable';

/** Tile metadata. Known flag keys drive query methods; arbitrary custom keys are preserved. */
export interface TileMetadata {
	solid?: boolean;
	blocksSight?: boolean;
	walkable?: boolean;
	[key: string]: unknown;
}

export interface ObjectDef {
	name: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	properties: Record<string, string | number | boolean>;
}

export interface RuntimeTileset {
	textureKey: string;
	columns: number;
	tileWidth: number;
	tileHeight: number;
	firstgid?: number;
}

export interface RuntimeLayer {
	name: string;
	tiles: Uint32Array | Uint8Array | readonly number[];
	parallax?: Vector2D;
	opacity?: number;
	visible?: boolean;
}

export interface TilemapRuntimeData {
	width: number;
	height: number;
	tileSize: number;
	layers: readonly RuntimeLayer[];
	tilesets: readonly RuntimeTileset[];
	tileMetadata?: Record<number, TileMetadata>;
	objectLayers?: readonly { name: string; objects: readonly ObjectDef[] }[];
}

export interface LoadedLayer {
	name: string;
	tiles: Uint32Array;
	parallax: Vector2D;
	opacity: number;
	visible: boolean;
}

export interface LoadedTileset {
	textureKey: string;
	columns: number;
	tileWidth: number;
	tileHeight: number;
	firstgid: number;
}

export interface LoadedObjectLayer {
	name: string;
	objects: readonly ObjectDef[];
}

export interface LoadedTilemap {
	readonly width: number;
	readonly height: number;
	readonly tileWidth: number;
	readonly tileHeight: number;
	readonly layers: readonly LoadedLayer[];
	readonly tilesets: readonly LoadedTileset[];
	readonly tileMetadata: ReadonlyMap<number, TileMetadata>;
	readonly objectLayers: readonly LoadedObjectLayer[];

	tileToWorld(tx: number, ty: number): Vector2D;
	worldToTile(wx: number, wy: number): { tx: number; ty: number };
	getTile(layerIndex: number, tx: number, ty: number): number;
	isSolid(tx: number, ty: number): boolean;
	isOpaque(tx: number, ty: number): boolean;
	isWalkable(tx: number, ty: number): boolean;
	buildNavGrid(layerIndex: number, costFn?: (tileId: number) => number): NavGrid;
	getObjectLayer(name: string): readonly ObjectDef[];
	getObjects(type: string): readonly ObjectDef[];
}

/** Subset of a Tiled `.tmj` (JSON) document we consume in v1. */
export interface TiledMap {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	tilesets: readonly TiledTileset[];
	layers: readonly TiledLayer[];
}

export interface TiledTileset {
	firstgid: number;
	columns: number;
	tilewidth: number;
	tileheight: number;
	image: string;
	imagewidth: number;
	imageheight: number;
	tiles?: readonly TiledTileDef[];
}

export interface TiledTileDef {
	id: number;
	properties?: readonly TiledProperty[];
	animation?: readonly { tileid: number; duration: number }[];
}

export interface TiledProperty {
	name: string;
	type: 'bool' | 'int' | 'float' | 'string' | 'color' | 'file' | 'object';
	value: string | number | boolean;
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledTileLayer {
	type: 'tilelayer';
	name: string;
	width: number;
	height: number;
	data: readonly number[];
	opacity: number;
	visible: boolean;
	parallaxx?: number;
	parallaxy?: number;
}

export interface TiledObjectLayer {
	type: 'objectgroup';
	name: string;
	objects: readonly TiledObject[];
}

export interface TiledObject {
	id: number;
	name?: string;
	type?: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	rotation?: number;
	properties?: readonly TiledProperty[];
}

export interface ParseTiledOptions {
	tilesetTextures: Record<string, string>;
}

export type TilemapCullingMode = 'viewport' | 'none';

export interface TilemapLayerComponent {
	dataKey: string;
	tilesetKey?: string;
	layerIndex: number;
	opacity: number;
	parallax: Vector2D;
	cullingMode: TilemapCullingMode;
	cameraRef?: number;
	tintFn?: (tx: number, ty: number) => number | null;
}

export interface TilemapColliderTag {
	dataKey: string;
}

export interface TilemapComponentTypes {
	tilemap: TilemapLayerComponent;
	tilemapCollider: TilemapColliderTag;
}

export interface TilemapRegistry {
	registerRuntime(dataKey: string, data: TilemapRuntimeData): LoadedTilemap;
	registerAsset(dataKey: string, assetKey: string, options?: ParseTiledOptions): Promise<LoadedTilemap>;
	get(dataKey: string): LoadedTilemap | undefined;
	has(dataKey: string): boolean;
	readonly entries: ReadonlyMap<string, LoadedTilemap>;
}

export interface TilemapResourceTypes {
	tilemaps: TilemapRegistry;
}

export type TilemapWorldConfig = WorldConfigFrom<TilemapComponentTypes, EmptyConfig['events'], TilemapResourceTypes>;

export interface TilemapPluginOptions<G extends string = 'rendering'> extends BasePluginOptions<G> {
	/** Optional collision layer name. When set, solid tiles auto-spawn `aabbCollider` strips. */
	collisionLayer?: string;
	/** Layers the auto-generated tile bodies collide with. */
	collidesWith?: readonly string[];
}

function toTilesArray(input: RuntimeLayer['tiles']): Uint32Array {
	return Uint32Array.from(input);
}

function tiledPropsToRecord(props?: readonly TiledProperty[]): Record<string, string | number | boolean> {
	if (!props) return {};
	const out: Record<string, string | number | boolean> = {};
	for (const p of props) out[p.name] = p.value;
	return out;
}

export function createLoadedTilemap(data: TilemapRuntimeData): LoadedTilemap {
	const { width, height, tileSize, layers, tilesets } = data;

	if (!Number.isFinite(width) || width <= 0) {
		throw new Error(`tilemap: width must be > 0, got ${width}`);
	}
	if (!Number.isFinite(height) || height <= 0) {
		throw new Error(`tilemap: height must be > 0, got ${height}`);
	}
	if (!Number.isFinite(tileSize) || tileSize <= 0) {
		throw new Error(`tilemap: tileSize must be > 0, got ${tileSize}`);
	}
	if (tilesets.length === 0) {
		throw new Error('tilemap: at least one tileset is required');
	}

	const expectedLen = width * height;

	const loadedLayers: LoadedLayer[] = layers.map((l) => {
		const tiles = toTilesArray(l.tiles);
		if (tiles.length !== expectedLen) {
			throw new Error(
				`tilemap: layer "${l.name}" tile count ${tiles.length} does not match width*height ${expectedLen}`,
			);
		}
		return {
			name: l.name,
			tiles,
			parallax: l.parallax ? { x: l.parallax.x, y: l.parallax.y } : { x: 1, y: 1 },
			opacity: l.opacity ?? 1,
			visible: l.visible ?? true,
		};
	});

	const loadedTilesets: LoadedTileset[] = tilesets.map((t, i) => {
		if (t.firstgid === undefined && i > 0) {
			throw new Error(`tilemap: runtime tileset at index ${i} ("${t.textureKey}") must specify an explicit firstgid`);
		}
		return {
			textureKey: t.textureKey,
			columns: t.columns,
			tileWidth: t.tileWidth,
			tileHeight: t.tileHeight,
			firstgid: t.firstgid ?? 1,
		};
	});

	const metadataMap = new Map<number, TileMetadata>();
	if (data.tileMetadata) {
		for (const [k, v] of Object.entries(data.tileMetadata)) {
			metadataMap.set(Number(k), { ...v });
		}
	}

	const objectLayers: LoadedObjectLayer[] = (data.objectLayers ?? []).map(l => ({
		name: l.name,
		objects: l.objects.map(o => ({ ...o, properties: { ...o.properties } })),
	}));

	return buildLoadedTilemap({
		width,
		height,
		tileWidth: tileSize,
		tileHeight: tileSize,
		layers: loadedLayers,
		tilesets: loadedTilesets,
		tileMetadata: metadataMap,
		objectLayers,
	});
}

export function parseTiledJSON(map: TiledMap, options: ParseTiledOptions): LoadedTilemap {
	const { width, height, tilewidth, tileheight } = map;
	const expectedLen = width * height;

	const loadedTilesets: LoadedTileset[] = map.tilesets.map((t) => {
		const textureKey = options.tilesetTextures[t.image];
		if (!textureKey) {
			throw new Error(`tilemap: no texture key registered for tileset image "${t.image}"`);
		}
		return {
			textureKey,
			columns: t.columns,
			tileWidth: t.tilewidth,
			tileHeight: t.tileheight,
			firstgid: t.firstgid,
		};
	});

	const metadataMap = new Map<number, TileMetadata>();
	for (const ts of map.tilesets) {
		if (!ts.tiles) continue;
		for (const td of ts.tiles) {
			metadataMap.set(ts.firstgid + td.id, tiledPropsToRecord(td.properties) as TileMetadata);
		}
	}

	const loadedLayers: LoadedLayer[] = [];
	const loadedObjectLayers: LoadedObjectLayer[] = [];
	for (const l of map.layers) {
		if (l.type === 'tilelayer') {
			if (l.data.length !== expectedLen) {
				throw new Error(
					`tilemap: layer "${l.name}" data length ${l.data.length} does not match map ${expectedLen}`,
				);
			}
			loadedLayers.push({
				name: l.name,
				tiles: Uint32Array.from(l.data),
				parallax: { x: l.parallaxx ?? 1, y: l.parallaxy ?? 1 },
				opacity: l.opacity,
				visible: l.visible,
			});
		} else {
			loadedObjectLayers.push({
				name: l.name,
				objects: l.objects.map(o => ({
					name: o.name ?? '',
					type: o.type ?? '',
					x: o.x,
					y: o.y,
					width: o.width ?? 0,
					height: o.height ?? 0,
					rotation: o.rotation ?? 0,
					properties: tiledPropsToRecord(o.properties),
				})),
			});
		}
	}

	return buildLoadedTilemap({
		width,
		height,
		tileWidth: tilewidth,
		tileHeight: tileheight,
		layers: loadedLayers,
		tilesets: loadedTilesets,
		tileMetadata: metadataMap,
		objectLayers: loadedObjectLayers,
	});
}

interface LoadedTilemapState {
	width: number;
	height: number;
	tileWidth: number;
	tileHeight: number;
	layers: LoadedLayer[];
	tilesets: LoadedTileset[];
	tileMetadata: Map<number, TileMetadata>;
	objectLayers: LoadedObjectLayer[];
}

function buildLoadedTilemap(state: LoadedTilemapState): LoadedTilemap {
	const { width, height, tileWidth, tileHeight, layers, tilesets, tileMetadata, objectLayers } = state;

	// Why: hot path. Inlining the bounds + cellIndex math here avoids
	// per-layer recomputation in the loop below (called by FOV / pathfinding consumers).
	const flagAtAnyLayer = (tx: number, ty: number, key: TileFlag): boolean => {
		if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
		const idx = ty * width + tx;
		for (let i = 0; i < layers.length; i++) {
			const gid = (layers[i]!.tiles[idx] ?? 0) & TILE_GID_MASK;
			if (gid === 0) continue;
			const meta = tileMetadata.get(gid);
			if (meta && meta[key] === true) return true;
		}
		return false;
	};

	const defaultCostFromMetadata = (gid: number): number => {
		const meta = tileMetadata.get(gid);
		return meta?.walkable === true ? 1 : 0;
	};

	return {
		width,
		height,
		tileWidth,
		tileHeight,
		layers,
		tilesets,
		tileMetadata,
		objectLayers,

		tileToWorld(tx, ty) {
			return { x: (tx + 0.5) * tileWidth, y: (ty + 0.5) * tileHeight };
		},

		worldToTile(wx, wy) {
			return { tx: Math.floor(wx / tileWidth), ty: Math.floor(wy / tileHeight) };
		},

		getTile(layerIndex, tx, ty) {
			const layer = layers[layerIndex];
			if (!layer) return 0;
			if (tx < 0 || ty < 0 || tx >= width || ty >= height) return 0;
			return (layer.tiles[ty * width + tx] ?? 0) & TILE_GID_MASK;
		},

		isSolid: (tx, ty) => flagAtAnyLayer(tx, ty, 'solid'),
		isOpaque: (tx, ty) => flagAtAnyLayer(tx, ty, 'blocksSight'),
		isWalkable: (tx, ty) => flagAtAnyLayer(tx, ty, 'walkable'),

		buildNavGrid(layerIndex, costFn) {
			const layer = layers[layerIndex];
			if (!layer) {
				throw new Error(`tilemap: buildNavGrid — no layer at index ${layerIndex}`);
			}
			const cells = new Uint8Array(width * height);
			const cost = costFn ?? defaultCostFromMetadata;
			for (let i = 0; i < cells.length; i++) {
				const gid = (layer.tiles[i] ?? 0) & TILE_GID_MASK;
				const c = cost(gid) | 0;
				cells[i] = c < 0 ? 0 : c > 255 ? 255 : c;
			}
			return createNavGrid({ width, height, cellSize: tileWidth, cells });
		},

		getObjectLayer(name) {
			return objectLayers.find(l => l.name === name)?.objects ?? [];
		},

		getObjects(type) {
			const out: ObjectDef[] = [];
			for (const layer of objectLayers) {
				for (const o of layer.objects) {
					if (o.type === type) out.push(o);
				}
			}
			return out;
		},
	};
}

interface CollisionStrip {
	tx: number;
	ty: number;
	tw: number;
	th: number;
}

/** Greedy row-first scan: each row produces N horizontal strips. No vertical merge in v1. */
function buildCollisionStrips(map: LoadedTilemap): CollisionStrip[] {
	const strips: CollisionStrip[] = [];
	for (let ty = 0; ty < map.height; ty++) {
		let runStart = -1;
		for (let tx = 0; tx <= map.width; tx++) {
			const solid = tx < map.width && map.isSolid(tx, ty);
			if (solid && runStart === -1) {
				runStart = tx;
			} else if (!solid && runStart !== -1) {
				strips.push({ tx: runStart, ty, tw: tx - runStart, th: 1 });
				runStart = -1;
			}
		}
	}
	return strips;
}

// Component shape for the optional collision-strip spawn. The plugin doesn't
// declare a hard requirement on the collision/transform plugins so users who
// don't enable `collisionLayer` aren't forced to install them; the cast at the
// spawn site is the bridge. When `collisionLayer` is set the user has installed
// both plugins by definition (otherwise the layer name would be meaningless).
interface CollisionSpawnShape {
	tilemapCollider: TilemapColliderTag;
	aabbCollider: AABBCollider;
	collisionLayer: CollisionLayer<string>;
	localTransform: LocalTransform;
	worldTransform: WorldTransform;
}

type TilemapWorld = ECSpresso<TilemapWorldConfig>;

type TilemapLabels = never;

export function createTilemapPlugin<G extends string = 'rendering'>(
	options: TilemapPluginOptions<G> = {},
) {
	const { collisionLayer, collidesWith } = options;

	return definePlugin('tilemap')
		.withComponentTypes<TilemapComponentTypes>()
		.withResourceTypes<TilemapResourceTypes>()
		.withLabels<TilemapLabels>()
		.withGroups<G>()
		.install((world: TilemapWorld) => {
			const entries = new Map<string, LoadedTilemap>();
			const colliderEntitiesByKey = new Map<string, number[]>();

			const despawnCollidersFor = (dataKey: string): void => {
				const ids = colliderEntitiesByKey.get(dataKey);
				if (!ids) return;
				for (const id of ids) world.removeEntity(id);
				colliderEntitiesByKey.delete(dataKey);
			};

			const spawnCollisionStripsFor = (dataKey: string, lt: LoadedTilemap): void => {
				if (!collisionLayer) return;
				const ids: number[] = [];
				for (const s of buildCollisionStrips(lt)) {
					const cx = (s.tx + s.tw / 2) * lt.tileWidth;
					const cy = (s.ty + s.th / 2) * lt.tileHeight;
					const components: CollisionSpawnShape = {
						tilemapCollider: { dataKey },
						aabbCollider: { width: s.tw * lt.tileWidth, height: s.th * lt.tileHeight },
						collisionLayer: { layer: collisionLayer, collidesWith: collidesWith ?? [] },
						localTransform: { x: cx, y: cy, rotation: 0, scaleX: 1, scaleY: 1 },
						worldTransform: { x: cx, y: cy, rotation: 0, scaleX: 1, scaleY: 1 },
					};
					const entity = (world as unknown as ECSpresso<WorldConfigFrom<CollisionSpawnShape>>).spawn(components);
					ids.push(entity.id);
				}
				if (ids.length > 0) colliderEntitiesByKey.set(dataKey, ids);
			};

			const ingest = (dataKey: string, lt: LoadedTilemap): LoadedTilemap => {
				despawnCollidersFor(dataKey);
				entries.set(dataKey, lt);
				spawnCollisionStripsFor(dataKey, lt);
				return lt;
			};

			const registry: TilemapRegistry = {
				entries,
				registerRuntime(dataKey, data) {
					return ingest(dataKey, createLoadedTilemap(data));
				},
				async registerAsset(dataKey, assetKey, parseOptions) {
					const raw = await (world as unknown as ECSpresso<WorldConfigFrom<EmptyConfig['components'], EmptyConfig['events'], EmptyConfig['resources'], { [k: string]: TiledMap }>>).loadAsset(assetKey) as TiledMap;
					return ingest(dataKey, parseTiledJSON(raw, parseOptions ?? { tilesetTextures: {} }));
				},
				get: (dataKey) => entries.get(dataKey),
				has: (dataKey) => entries.has(dataKey),
			};

			world.addResource('tilemaps', registry);
		});
}

/**
 * Create a `tilemap` layer component for spreading into `spawn()`.
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createTilemapLayer('dungeon', 0),
 *   ...createLocalTransform(0, 0),
 * });
 * ```
 */
export function createTilemapLayer(
	dataKey: string,
	layerIndex: number,
	options?: {
		tilesetKey?: string;
		opacity?: number;
		parallax?: Vector2D;
		cullingMode?: TilemapCullingMode;
		cameraRef?: number;
		tintFn?: (tx: number, ty: number) => number | null;
	},
): Pick<TilemapComponentTypes, 'tilemap'> {
	return {
		tilemap: {
			dataKey,
			layerIndex,
			tilesetKey: options?.tilesetKey,
			opacity: options?.opacity ?? 1,
			parallax: options?.parallax ?? { x: 1, y: 1 },
			cullingMode: options?.cullingMode ?? 'viewport',
			cameraRef: options?.cameraRef,
			tintFn: options?.tintFn,
		},
	};
}
