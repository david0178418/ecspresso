const pluginPaths = [
	'.claude-plugin/plugin.json',
	'.codex-plugin/plugin.json',
] as const;

const isJsonObject = function (value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const readJsonObject = async function (path: string) {
	const value: unknown = await Bun.file(path).json();

	if (!isJsonObject(value)) {
		throw new Error(`${path} must contain a JSON object`);
	}

	return value;
};

const packageJson = await readJsonObject('package.json');
const packageVersion = packageJson['version'];

if (typeof packageVersion !== 'string') {
	throw new Error('package.json must contain a string version');
}

const syncPluginVersion = async function (pluginPath: string) {
	const pluginJson = await readJsonObject(pluginPath);
	const nextPluginJson = { ...pluginJson, version: packageVersion };

	await Bun.write(pluginPath, JSON.stringify(nextPluginJson, null, '\t') + '\n');
};

await Promise.all(pluginPaths.map(syncPluginVersion));
