const pluginJson = await Bun.file('.claude-plugin/plugin.json').json();
const packageJson = await Bun.file('package.json').json();

pluginJson.version = packageJson.version;

await Bun.write(
	'.claude-plugin/plugin.json',
	JSON.stringify(pluginJson, null, '\t') + '\n',
);
