const fs = require('fs');
const inquirer = require('inquirer');
const path = require('path');
const execa = require('execa');
const ConfigStore = require('configstore');
const { PathPrompt } = require('inquirer-path');
const isPathGitRepository = require('./utilities/isPathGitRepository')
const createPresetDescription = require('./utilities/createPresetDescription');

inquirer.registerPrompt('path', PathPrompt);
const config = new ConfigStore('knitty');

async function create() {
	let options = await promptCreateOptions();

	createProject(options.projectName, options.projectPath, options);
}

async function createProject(projectName, projectPath, options) {
	let fullProjectPath = path.resolve(projectPath, projectName);

	if (!doesDirectoryExist(fullProjectPath)) {
		createDirectory(fullProjectPath);
	}

	if (
		options.shouldInitGitRepository &&
		(!(await isPathGitRepository(fullProjectPath)))
	) {
		await gitInit(fullProjectPath);
		createGitIgnore(fullProjectPath);

		if (options.shouldAddRemote) {
			gitAddRemote(fullProjectPath, options.remoteName, options.remoteUrl);
		}
	}

	if (options.projectType === 'webapp') {
		await setUpWebApp(fullProjectPath, projectName);
	}

	if (options.projectType === 'module') {
		await setUpModule(fullProjectPath);
	}

	if (options.features.includes('editorConfig')) {
		let editorConfigContents = await getEditorConfigContents(options.editorConfig);
		createFile(fullProjectPath, '.editorconfig', editorConfigContents);
	}

	addReadMe(fullProjectPath, projectName)

	console.log(`✨ ${projectName} created at ${fullProjectPath}`);
}

async function promptCreateOptions() {
	options = {};

	options.projectName = await promptProjectName();
	options.projectPath = await promptProjectPath();

	if (await promptShouldInitGitRepository()) {
		options.shouldInitGitRepository = true;

		if (await promptShouldAddRemoteGitRepository()) {
			options.shouldAddRemote = true;
			options.remoteName = await promptGitRemoteName();
			options.remoteUrl = await promptGitRemoteUrl();
		}
	}

	options.projectType = await promptSelectProjectType();
	options.features = await promptProjectFeatures();

	if (options.features.includes('editorConfig')) {
		options.editorConfig = await promptEditorConfigOptions();
	}

	return options;
}

async function promptProjectName() {
	return await inquirer.prompt([
		{
			type: 'input',
			name: 'projectName',
			message: 'Project name?',
			validate: (value) => {
				if (!value) {
					return 'Please provide a name for your project.';
				}

				if (value.indexOf(' ') >= 0) {
					return 'Please provide a name without spaces.';
				}

				return true;
			}
		}
	]).then((answers) => {
		return answers.projectName;
	});
}

async function promptProjectPath() {
	return await inquirer.prompt([
		{
			type: 'path',
			name: 'projectPath',
			directoryOnly: true,
			message: 'Where should it be created?',
			default: '.',
		}
	]).then((answers) => {
		return answers.projectPath;
	});
}

async function promptShouldInitGitRepository() {
	return await inquirer.prompt([
		{
			type: 'confirm',
			name: 'shouldInitGitRepository',
			message: 'Initialize a git repo?',
			default: true,
		}
	]).then((answers) => {
		return answers.shouldInitGitRepository;
	});
}

async function promptGitRemoteName() {
	return await inquirer.prompt([
		{
			type: 'input',
			name: 'remoteName',
			message: 'Remote name',
			default: 'origin',
		}
	]).then((answers) => {
		return answers.remoteName;
	});
}

async function promptGitRemoteUrl() {
	return await inquirer.prompt([
		{
			type: 'input',
			name: 'remoteUrl',
			message: 'Remote URL',
		}
	]).then((answers) => {
		return answers.remoteUrl;
	});
}

async function promptShouldAddRemoteGitRepository() {
	return await inquirer.prompt([
		{
			type: 'confirm',
			name: 'shouldAddRemote',
			message: 'Do you want to add a remote repository?',
			default: false,
		}
	]).then((answers) => {
		return answers.shouldAddRemote;
	});
}

async function promptSelectProjectType() {
	return await inquirer.prompt([
		{
			type: 'list',
			name: 'projectType',
			message: 'What kind of project are you starting?',
			choices: [
				{
					name: 'Website or web app',
					value: 'webapp',
				},
				{
					name: 'Module',
					value: 'module',
				},
			]
		}
	]).then((answers) => {
		return answers.projectType;
	});
}

async function promptProjectFeatures() {
	return await inquirer.prompt([
		{
			type: 'checkbox',
			name: 'features',
			message: 'Select the features you need for your project:',
			choices: [
				{
					name: 'EditorConfig',
					value: 'editorConfig',
					checked: false,
				},

			]
		}
	]).then((answers) => {
		return answers.features;
	});
}

async function promptEditorConfigOptions() {
	console.log('\nLet\'s set up .editorconfig!');

	let editorConfigPresetToUse = await promptNameOfEditorConfigPresetToUse();

	if (editorConfigPresetToUse) {
		return config.get(`presets.editorConfig.${editorConfigPresetToUse}`)
	}

	editorConfigOptions = {};
	editorConfigOptions.source = await promptEditorConfigSource();

	if (editorConfigOptions.source === 'local') {
		editorConfigOptions.path = await promptEditorConfigLocalPath();
	}

	if (editorConfigOptions.source === 'hosted') {
		editorConfigOptions.path = await promptEditorConfigHostedUrl();
	}

	if (editorConfigOptions.source === 'editor') {
		editorConfigOptions.contents = await promptEditorConfigContentsFromEditor();
	}

	if (await promptShouldSaveEditorConfigPreset()) {
		let presetName = await promptGiveEditorConfigPresetName();

		config.set(`presets.editorConfig.${presetName}`, Object.assign({}, editorConfigOptions, {
			presetName: presetName,
		}));
	}

	return editorConfigOptions;
}

async function promptNameOfEditorConfigPresetToUse() {
	if (!config.has('presets.editorConfig')) {
		return false;
	}

	return await inquirer.prompt([
		{
			type: 'list',
			name: 'editorConfigPresetName',
			message: 'Do you want to use one of your saved presents?',
			choices: [
				{
					name: 'Don\'t use any preset',
					value: false,
				},
				new inquirer.Separator,
				...Object.values(config.get('presets.editorConfig')).map((preset) => {
					return {
						name: `${preset.presetName} (${createPresetDescription(preset)})`,
						short: preset.presetName,
						value: preset.presetName,
					}
				}),
			],
		}
	]).then((answers) => {
		return answers.editorConfigPresetName;
	});
}

async function promptEditorConfigSource() {
	return await inquirer.prompt([
		{
			type: 'list',
			name: 'editorConfigSource',
			message: 'Where should the .editorconfig contents come from?',
			choices: [
				{
					name: 'Local file',
					value: 'local',
				},
				{
					name: 'Hosted file',
					value: 'hosted',
				},
				{
					name: 'Open my editor',
					value: 'editor',
				},
				{
					name: 'Leave empty',
					value: 'empty',
				},
			]
		}
	]).then((answers) => {
		return answers.editorConfigSource;
	});
}

async function promptEditorConfigLocalPath() {
	return await inquirer.prompt([
		{
			type: 'path',
			name: 'editorConfigPath',
			message: '.editorconfig file path?',
			validate: (answer) => {
				if (!fs.existsSync(answer)) {
					return 'This path doesn\'t exist.'
				}

				if (!fs.statSync(answer).isFile()) {
					return 'The path you provided is not a file.'
				}

				return true;
			}
		}
	]).then((answers) => {
		return answers.editorConfigPath;
	});
}

async function promptEditorConfigHostedUrl() {
	return await inquirer.prompt([
		{
			type: 'input',
			name: 'editorConfigPath',
			message: '.editorconfig file URL?',
		}
	]).then((answers) => {
		return answers.editorConfigPath;
	});
}

async function promptEditorConfigContentsFromEditor() {
	return await inquirer.prompt([
		{
			type: 'editor',
			name: 'editorConfigContents',
			message: 'Provide your .editorconfig here',
		}
	]).then((answers) => {
		return answers.editorConfigContents
	});
}

async function promptShouldSaveEditorConfigPreset() {
	return await inquirer.prompt([
		{
			type: 'confirm',
			name: 'shouldSaveEditorConfigPreset',
			message: 'Do you want to save this .editorconfig setup as a preset?',
		}
	]).then(async (answers) => {
		return answers.shouldSaveEditorConfigPreset;
	});
}

async function promptGiveEditorConfigPresetName() {
	return await inquirer.prompt([
		{
			type: 'input',
			name: 'editorConfigPresetName',
			message: 'Give this .editorconfig preset a name.',
			default: 'default'
		}
	]).then((answers) => {
		return answers.editorConfigPresetName;
	});
}

async function gitInit(repositoryPath) {
	return await execa.command('git init', { cwd: repositoryPath })
		.then(() => {
			return true;
		})
		.catch(() => {
			return false
		});
}

async function gitAddRemote(repositoryPath, remoteName, remoteUrl) {
	return await execa.command(`git remote add ${remoteName} ${remoteUrl}`, { cwd: repositoryPath })
		.then(() => {
			return true;
		})
		.catch(() => {
			return false
		});
}

function createGitIgnore(projectPath) {
	createFile(projectPath, '.gitignore', 'node_modules');
}

async function setUpWebApp(projectPath, projectName) {
	createFile(projectPath, 'index.html', createIndexHtmlContents(projectName));

	let scriptDirectoryPath = path.resolve(projectPath, 'script');
	createDirectory(scriptDirectoryPath);
	createFile(scriptDirectoryPath, 'main.js', '\n');

	let styleDirectoryPath = path.resolve(projectPath, 'style');
	createDirectory(styleDirectoryPath);
	createFile(styleDirectoryPath, 'main.css', '\n');
}

async function setUpModule(projectPath, projectName) {
	createFile(projectPath, 'index.js');
}

function addReadMe(projectPath, projectName) {
	createFile(projectPath, 'README.md', createReadMeContents(projectName));
}

function createFile(filePath, fileName, contents = '\n') {
	if (!contents.endsWith('\n')) {
		contents = `${contents}\n`;
	}

	fs.writeFileSync(path.resolve(filePath, fileName), contents);
}

function doesDirectoryExist(fullPath) {
	return fs.existsSync(fullPath);
}

function createDirectory(fullPath) {
	fs.mkdirSync(fullPath, {
		recursive: true,
	});
}

async function getLocalEditorConfigContents(filepath) {
	return await execa.command(`cat ${filepath}`)
		.then((response) => {
			return response.stdout;
		})
		.catch(() => {
			return '';
		});
}

async function getEditorConfigContents(editorConfigOptions) {
	if (editorConfigOptions.source === 'local') {
		return await getLocalEditorConfigContents(editorConfigOptions.path);
	}

	if (editorConfigOptions.source === 'hosted') {
		return await getHostedEditorConfigContents(editorConfigOptions.path);
	}

	if (editorConfigOptions.source === 'editor') {
		return editorConfigOptions.contents;
	}

	return '';

}

async function getHostedEditorConfigContents(url) {
	return await execa.command(`curl ${url}`)
		.then((response) => {
			return response.stdout;
		})
		.catch(() => {
			return '';
		});
}

function createIndexHtmlContents(projectName) {
	return `<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width,initial-scale=1.0">
		<link rel="stylesheet" href="style/main.css">
		<title>${projectName}</title>
	</head>
	<body>
		<script src="script/main.js"></script>
	</body>
</html>`;
}

function createReadMeContents(projectName) {
	return `# ${projectName}`;
}

module.exports = create;
