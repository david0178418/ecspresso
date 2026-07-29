const CHANGELOG_PATH = 'CHANGELOG.md';

async function prepareRelease(): Promise<void> {
	const packageJson: unknown = await Bun.file('package.json').json();
	if (
		typeof packageJson !== 'object'
		|| packageJson === null
		|| !('version' in packageJson)
		|| typeof packageJson.version !== 'string'
	) {
		throw new Error('package.json must contain a string version');
	}

	const changelog = await Bun.file(CHANGELOG_PATH).text();
	const unreleasedHeading = /^## Unreleased$/m;
	if (!unreleasedHeading.test(changelog)) {
		throw new Error('CHANGELOG.md must contain a level-two Unreleased heading');
	}

	await Bun.write(
		CHANGELOG_PATH,
		changelog.replace(unreleasedHeading, `## ${packageJson.version}`),
	);
}

await prepareRelease();
