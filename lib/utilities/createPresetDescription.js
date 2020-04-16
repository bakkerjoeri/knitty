function createPresetDescription(options) {
	if (options.path) {
		return `import from ${options.path}`;
	}

	if (options.source === 'editor') {
		return 'custom content';
	}

	if (options.source === 'empty') {
		return 'empty config';
	}
}

module.exports = createPresetDescription;
