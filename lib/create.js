const fs = require('fs');
const inquirer = require('inquirer');
const path = require('path');
const execa = require('execa');
const { PathPrompt } = require('inquirer-path');
const isPathGitRepository = require('./utilities/isPathGitRepository')

inquirer.registerPrompt('path', PathPrompt);

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
        
        if (options.shouldAddRemote) {
            gitAddRemote(fullProjectPath, options.remoteName, options.remoteUrl);
        }
    }
    
    if (options.features.includes('editorConfig')) {
        let editorConfigContent = '';
        
        if (options.editorConfigLocation === 'local') {
            editorConfigContent = await getLocalEditorConfigContents(options.editorConfigPath);
        }
        
        if (options.editorConfigLocation === 'hosted') {
            editorConfigContent = await getHostedEditorConfigContents(options.editorConfigPath);
        }
        
        if (options.editorConfigLocation === 'editor') {
            editorConfigContent = options.editorConfigContent;
        }
        
        await createEditorConfigFile(fullProjectPath, editorConfigContent);
    }
    
    console.log(`✨ ${projectName} created at ${fullProjectPath}`);
}

async function promptCreateOptions() {
    options = {};
    
    await inquirer.prompt([
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
            type: 'path',
            name: 'projectPath',
            directoryOnly: true,
            message: 'Where should it be created?',
            default: '.',
        }
    ]).then((answers) => {
        options.projectName = answers.projectName;
        options.projectPath = answers.projectPath;
    });
    
    await inquirer.prompt([
        {
            type: 'confirm',
            name: 'shouldInitGitRepository',
            message: 'Initialize a git repo?',
            default: true,
        }
    ]).then((answers) => {
        options.shouldInitGitRepository = answers.shouldInitGitRepository;
    });
    
    if (options.shouldInitGitRepository) {
        await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldAddRemote',
                message: 'Do you want to add a remote repository?',
                default: false,
            }
        ]).then((answers) => {
            options.shouldAddRemote = answers.shouldAddRemote;
        });
        
        if (options.shouldAddRemote) {
            options.shouldAddRemote = true;
            
            await inquirer.prompt([
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
            ]).then((answers) => {
                options.remoteName = answers.remoteName;
                options.remoteUrl = answers.remoteUrl;
            });
        }
    }
        
    await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'features',
            message: 'Select the features you need for your project:',
            choices: [
                {
                    name: 'EditorConfig',
                    value: 'editorConfig',
                    checked: true,
                }
            ]
        }
    ]).then((answers) => {
        options.features = answers.features;
    });
    
    if (options.features.includes('editorConfig')) {
        await inquirer.prompt([
            {
                type: 'list',
                name: 'editorConfigLocation',
                message: 'Where should .editorconfig contents come from?',
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
            options.editorConfigLocation = answers.editorConfigLocation;
        })
        
        if (options.editorConfigLocation === 'local') {
            await inquirer.prompt([
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
                options.editorConfigPath = answers.editorConfigPath
            })
        }
        
        if (options.editorConfigLocation === 'hosted') {
            await inquirer.prompt([
                {
                    type: 'input',
                    name: 'editorConfigPath',
                    message: '.editorconfig file URL?',
                }
            ]).then((answers) => {
                options.editorConfigPath = answers.editorConfigPath
            })
        }
        
        if (options.editorConfigLocation === 'editor') {
            await inquirer.prompt([
                {
                    type: 'editor',
                    name: 'editorConfigContent',
                    message: 'Provide your .editorconfig here',
                }
            ]).then((answers) => {
                options.editorConfigContent = answers.editorConfigContent
            })
        }
    }
    
    return options;
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

async function createEditorConfigFile(projectPath, content) {
    let editorConfigFilePath = path.resolve(projectPath, '.editorconfig');
    
    fs.writeFileSync(editorConfigFilePath, content);
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
    return await execa.shell(`cat ${filepath}`)
        .then((response) => {
            return response.stdout;
        })
        .catch(() => {
            return '';
        });
}

async function getHostedEditorConfigContents(url) {
    return await execa.shell(`curl ${url}`)
        .then((response) => {
            return response.stdout;
        })
        .catch(() => {
            return '';
        });
}

module.exports = create;