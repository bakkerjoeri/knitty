const fs = require('fs');
const inquirer = require('inquirer');
const path = require('path');
const execa = require('execa');
const isPathGitRepository = require('./utilities/isPathGitRepository')

async function create() {
    options = {};
    
    let {projectName, projectPath} = await inquirer.prompt([
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
        },
        {
            type: 'input',
            name: 'projectPath',
            message: 'Where should it be created?',
            default: '.',
        }
    ]);
    
    let {shouldInitGitRepository} = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'shouldInitGitRepository',
            message: 'Initialize a git repo?',
            default: true,
        }
    ]);
    
    if (shouldInitGitRepository) {
        options.shouldInitGitRepository = true;
        let {shouldAddRemote} = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldAddRemote',
                message: 'Do you want to add a remote repository?',
                default: false,
            }
        ]);
        
        if (shouldAddRemote) {
            options.shouldAddRemote = true;
            
            let {remoteName, remoteUrl} = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'remoteName',
                    message: 'Remote name',
                    default: 'origin',
                },
                {
                    type: 'input',
                    name: 'remoteUrl',
                    message: 'Remote URL',
                },
            ]);
            
            options.remoteName = remoteName;
            options.remoteUrl = remoteUrl;
        }
    }
        
    let {features} = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'features',
            message: 'Select the features you need for your project:',
            choices: [
                {
                    name: 'EditorConfig',
                    value: 'editorconfig',
                    checked: true,
                }
            ]
        }
    ]);
    
    options.features = features;
    
    console.log(options);
    
    createProject(projectName, projectPath, options);
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
        
        if (options.shouldAddRemote) {
            gitAddRemote(fullProjectPath, options.remoteName, options.remoteUrl);
        }
    }
    
    if (options.features.includes('editorconfig')) {
        await createEditorConfigFile(fullProjectPath);
    }
    
    console.log(`${projectName} created at ${fullProjectPath}`);
}

async function gitInit(repositoryPath) {
    return await execa.shell('git init', { cwd: repositoryPath })
        .then(() => {
            return true;
        })
        .catch(() => {
            return false
        });
}

async function gitAddRemote(repositoryPath, remoteName, remoteUrl) {
    return await execa.shell(`git remote add ${remoteName} ${remoteUrl}`, { cwd: repositoryPath })
        .then(() => {
            return true;
        })
        .catch(() => {
            return false
        });
}

async function createEditorConfigFile(fullPath) {
    let editorConfigFilePath = path.resolve(fullPath, '.editorconfig');
    
    fs.writeFileSync(editorConfigFilePath, await getEditorConfigContents());
}

function doesDirectoryExist(fullPath) {
    return fs.existsSync(fullPath);
}

function createDirectory(fullPath) {
    fs.mkdirSync(fullPath, {
        recursive: true,
    });
}

async function getEditorConfigContents() {
    let {stdout} = await execa.shell('curl https://raw.githubusercontent.com/joeribakker/web-setup/master/project/es6/.editorconfig');
    
    return stdout;
}

module.exports = create;