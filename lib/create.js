const fs = require('fs');
const inquirer = require('inquirer');
const path = require('path');
const execa = require('execa');
const ConfigStore = require('configstore');
const { PathPrompt } = require('inquirer-path');
const isPathGitRepository = require('./utilities/isPathGitRepository')

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
        
        if (options.shouldAddRemote) {
            gitAddRemote(fullProjectPath, options.remoteName, options.remoteUrl);
        }
    }
    
    if (options.features.includes('editorConfig')) {
        let editorConfigContents = await getEditorConfigContents(options.editorConfig);
        await createEditorConfigFile(fullProjectPath, editorConfigContents);
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
        console.log('\nLet\'s set up .editorconfig!');
        
        options.editorConfig = {};
        let usePreset = false;
        
        if (config.has('editorConfigPresets')) {
            await inquirer.prompt([
                {
                    type: 'list',
                    name: 'editorConfigPresetName',
                    message: 'Do you want to use one of your saved presents?',
                    choices: () => {
                        return [
                            ...Object.values(config.get('editorConfigPresets')).map((preset) => {
                                return {
                                    name: preset.presetName,
                                    value: preset.presetName,
                                }
                            }),
                            new inquirer.Separator,
                            {
                                name: 'Don\'t use any preset',
                                value: false,
                            }
                        ];
                    },
                }
            ]).then((answers) => {
                if (answers.editorConfigPresetName) {
                    usePreset = true;
                    options.editorConfig = config.get(`editorConfigPresets.${answers.editorConfigPresetName}`)
                }
            })
        }
        
        if (!usePreset) {
            await inquirer.prompt([
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
                options.editorConfig.source = answers.editorConfigSource;
            })
            
            if (options.editorConfig.source === 'local') {
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
                    options.editorConfig.path = answers.editorConfigPath
                })
            }
            
            if (options.editorConfig.source === 'hosted') {
                await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'editorConfigPath',
                        message: '.editorconfig file URL?',
                    }
                ]).then((answers) => {
                    options.editorConfig.path = answers.editorConfigPath
                })
            }
            
            if (options.editorConfig.source === 'editor') {
                await inquirer.prompt([
                    {
                        type: 'editor',
                        name: 'editorConfigContents',
                        message: 'Provide your .editorconfig here',
                    }
                ]).then((answers) => {
                    options.editorConfig.contents = answers.editorConfigContents
                })
            }
            
            await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'shouldSaveEditorConfigPreset',
                    message: 'Do you want to save this .editorconfig setup as a preset?',
                }
            ]).then(async (answers) => {
                if (answers.shouldSaveEditorConfigPreset) {
                    await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'editorConfigPresetName',
                            message: 'Give this .editorconfig preset a name.',
                            default: 'default'
                        }
                    ]).then((answers) => {
                        config.set(`editorConfigPresets.${answers.editorConfigPresetName}`, Object.assign({}, options.editorConfig, {
                            presetName: answers.editorConfigPresetName
                        }));
                    });
                }
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

async function createEditorConfigFile(projectPath, contents) {
    let editorConfigFilePath = path.resolve(projectPath, '.editorconfig');
    
    fs.writeFileSync(editorConfigFilePath, contents);
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
    return await execa.shell(`curl ${url}`)
        .then((response) => {
            return response.stdout;
        })
        .catch(() => {
            return '';
        });
}

module.exports = create;