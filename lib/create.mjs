import {writeFileSync, existsSync, mkdirSync} from 'fs';
import inquirer from 'inquirer';
import {resolve} from 'path';
import {execaCommand} from 'execa';
import ConfigStore from 'configstore';
import {PathPrompt} from 'inquirer-path';
import isPathGitRepository from './utilities/isPathGitRepository.mjs';

const {registerPrompt, prompt} = inquirer;
registerPrompt('path', PathPrompt);
const config = new ConfigStore('knitty');

async function create() {
	let options = await promptCreateOptions();
	createProject(options.projectName, options.projectPath, options);
	saveDefaults(options);
}

async function createProject(projectName, projectPath, options) {
	let fullProjectPath = resolve(projectPath, projectName);

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
		setUpWebApp(fullProjectPath, projectName, options.typescript?.outDir);
	}

	if (options.projectType === 'module') {
		setUpModule(fullProjectPath, options);
	}

	if (options.features.includes('ts')) {
		const tsConfigContent = getTypeScriptConfigContents(options);
		createFile(fullProjectPath, 'tsconfig.json', JSON.stringify(tsConfigContent, null, '\t'));
	}

	if (options.features.includes('jest')) {
		const jestConfigContent = getJestConfigContent(options);
		createFile(fullProjectPath, 'jest.config.json', JSON.stringify(jestConfigContent, null, '\t'));
	}

	addPackageFile(fullProjectPath, options);
	addReadMe(fullProjectPath, projectName);

	const devDependenciesToInstall = getDevDependenciesToInstall(options);

	if (devDependenciesToInstall.length) {
		console.log(`\n📦 Installing the following dependencies:\n${devDependenciesToInstall.map(dependency => `* ${dependency}`).join('\n')}`);
		await execaCommand(`npm install ${devDependenciesToInstall.join(' ')} --save-dev`, { cwd: fullProjectPath });
	}

	console.log(`✨ ${projectName} created at ${fullProjectPath}`);
}

function saveDefaults(options) {
	if (options.author) {
		config.set('author', options.author);
	}
}

async function promptCreateOptions() {
	const options = {};

	options.projectName = await promptProjectName();
	options.projectPath = await promptProjectPath();
	options.author = await promptAuthor();

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

	if (options.features.includes('ts')) {
		options.typescript = await promptTypeScriptOptions();
	}

	return options;
}

async function promptProjectName() {
	return await prompt([
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
	return await prompt([
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

async function promptAuthor() {
	return await prompt([
		{
			type: 'input',
			name: 'author',
			message: 'Author?',
			...(config.has('author') && { default: config.get('author') }),
		}
	]).then((answers) => {
		return answers.author;
	});
}

async function promptShouldInitGitRepository() {
	return await prompt([
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
	return await prompt([
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
	return await prompt([
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
	return await prompt([
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
	return await prompt([
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
	return await prompt([
		{
			type: 'checkbox',
			name: 'features',
			message: 'Select the features you need for your project:',
			choices: [
				{
					name: 'TypeScript',
					value: 'ts',
					checked: false,
				},
				{
					name: 'Testing with Jest',
					value: 'jest',
					checked: false,
				},
			]
		}
	]).then((answers) => {
		return answers.features;
	});
}

async function promptTypeScriptOptions() {
	console.log('\nLet\'s set up TypeScript!');

	const outDir = await promptTypeScriptOutDir()

	return {
		outDir,
	};
}

async function promptTypeScriptOutDir() {
	return await prompt([
		{
			type: 'input',
			name: 'outDir',
			message: 'Where should TypeScript build to?',
			default: 'dist',
		},
	]).then((answers) => {
		return answers.outDir;
	});
}

async function gitInit(repositoryPath) {
	return await execaCommand('git init', { cwd: repositoryPath })
		.then(() => {
			return true;
		})
		.catch(() => {
			return false
		});
}

async function gitAddRemote(repositoryPath, remoteName, remoteUrl) {
	return await execaCommand(`git remote add ${remoteName} ${remoteUrl}`, { cwd: repositoryPath })
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

function setUpWebApp(projectPath, projectName, outDir) {
	createFile(projectPath, 'index.html', createIndexHtmlContents(projectName, outDir));

	let scriptDirectoryPath = resolve(projectPath, 'script');
	createDirectory(scriptDirectoryPath);
	createFile(scriptDirectoryPath, 'main.js', '\n');

	let styleDirectoryPath = resolve(projectPath, 'style');
	createDirectory(styleDirectoryPath);
	createFile(styleDirectoryPath, 'main.css', '\n');
}

function setUpModule(projectPath, options) {
	if (options.features.includes('ts')) {
		createFile(resolve(projectPath, 'src'), 'index.ts');
	} else {
		createFile(resolve(projectPath, 'src'), 'index.js');
	}
}

function getDevDependenciesToInstall(options) {
	const dependencies = [];

	if (options.features.includes('ts')) {
		dependencies.push('typescript');
	}

	if (options.features.includes('jest')) {
		dependencies.push('jest');
	}

	if (options.features.includes('ts') && options.features.includes('jest')) {
		dependencies.push('ts-jest');
		dependencies.push('@types/jest');
	}

	return dependencies;
}

function addPackageFile(projectPath, options) {
	const packageFileContents = {
		name: options.projectName,
		version: '0.0.0',
		author: options.author,
		license: 'MIT',
		...(options.shouldInitGitRepository && options.shouldAddRemote && {
			repository: {
				type: 'git',
				url: options.remoteUrl,
			},
		}),
		...(options.projectType === 'module' && { main: options.features.includes('ts') && options.typescript.outDir ? `${options.typescript.outDir}/index.js` : 'src/index.js' }),
		...(options.features.includes('ts') && options.projectType === 'module' && { types: options.typescript.outDir ? `${options.typescript.outDir}/index.d.ts` : 'index.d.ts', }),
		scripts: {
			...(options.features.includes('ts') && { build: getBuildScriptCommand(options.typescript.outDir) }),
			...(options.features.includes('jest') && { test: 'jest' }),
			...(options.features.includes('jest') && { preversion: 'npm run test' }),
			...(options.features.includes('ts') && { version: options.typescript.outDir ? `npm run build && git add -A ${options.typescript.outDir}` : `npm run build && git add -A` }),
			postversion: 'git push && git push --tags'
		},
		dependencies: {},
		devDependencies: {},
	};

	createFile(projectPath, 'package.json', JSON.stringify(packageFileContents, null, '\t'));
}

function addReadMe(projectPath, projectName) {
	createFile(projectPath, 'README.md', createReadMeContents(projectName));
}

function createFile(filePath, fileName, contents = '\n') {
	if (!doesDirectoryExist(filePath)) {
		createDirectory(filePath);
	}

	if (!contents.endsWith('\n')) {
		contents = `${contents}\n`;
	}

	writeFileSync(resolve(filePath, fileName), contents);
}

function doesDirectoryExist(fullPath) {
	return existsSync(fullPath);
}

function createDirectory(fullPath) {
	mkdirSync(fullPath, {
		recursive: true,
	});
}

function getTypeScriptConfigContents(options) {
	return {
		compilerOptions: {
			strict: true,
			target: 'ES6',
			moduleResolution: 'node',
			esModuleInterop: true,
			...(!!options.typescript.outDir && { outDir: options.typescript.outDir }),
			declaration: true
		},
		include: [
			...(!!options.projectType === 'webapp' ? ['script/**/*'] : []),
			...(!!options.projectType === 'module' ? ['src/**/*'] : []),
		],
		exclude: [
			'node_modules',
			...(!!options.typescript.outDir ? [options.typescript.outDir] : []),
			...(!!options.features.includes('jest') ? ['**/*.spec.ts'] : []),

		]
	}
}

function getJestConfigContent(options) {
	return {
		...(options.features.includes('ts') && { preset: 'ts-jest' }),
		testEnvironment: "node"
	}
}

function createIndexHtmlContents(projectName, outDir = 'script') {
	return `<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width,initial-scale=1.0">
		<link rel="stylesheet" href="style/main.css">
		<title>${projectName}</title>
	</head>
	<body>
		<script src="${outDir}/main.js"></script>
	</body>
</html>`;
}

function createReadMeContents(projectName) {
	return `# ${projectName}`;
}

function getBuildScriptCommand(outDir) {
    if (outDir === '.' || outDir === '') {
        return 'tsc'
    }

    return `rm -rf ${outDir} && tsc`;
}

export default create;
