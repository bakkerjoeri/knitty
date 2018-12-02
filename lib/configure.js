const inquirer = require('inquirer');
const ConfigStore = require('configstore');
const createPresetDescription = require('./utilities/createPresetDescription');

const config = new ConfigStore('knitty');

async function configure() {
    let toConfigure = await promptConfigureStart();
    
    if (toConfigure === 'presets') {
        await configurePresets();
    }
    
    if (toConfigure === 'reset' && await promptConfirmResetSettings()) {
        resetKnittySettings();
    }
    
    await configure();
}

async function configurePresets() {
    let categoryToManage = await promptManagePresetsCategory();
    
    if (!categoryToManage) {
        return await configure();
    }
    
    await configurePresetCategory(categoryToManage);
}

async function configurePresetCategory(category) {
    if (!config.has(`presets.${category}`) || !Object.keys(config.get(`presets.${category}`)).length) {
        console.log('No presets found.');
        
        return await configurePresets();
    }
    
    let presetName = await promptManageEditorConfigPresets();
    
    if (!presetName) {
        return await configurePresets();
    }
    
    await configurePreset(category, presetName);
}

async function configurePreset(category, name) {
    let toDoWithPreset = await promptWhatToDoWithPreset(name);
    
    if (toDoWithPreset === 'delete') {
        if (!(await promptConfirmDeletePreset(name))) {
            return await configurePreset(category, name);
        }
        
        deletePreset(category, name);
    }
    
    await configurePresetCategory(category);
}

function resetKnittySettings() {
    config.clear();
    console.log('💥 All knitty settings have been reset.');
}

function deletePreset(category, name) {
    config.delete(`presets.${category}.${name}`);
    
    console.log(`💥 EditorConfig preset "${name}" was deleted.`);
}

async function promptConfigureStart() {
    return await inquirer.prompt([
        {
            type: 'list',
            message: 'What do you want to do?',
            name: 'toConfigure',
            choices: [
                {
                    name: 'Manage presets',
                    value: 'presets',
                },
                new inquirer.Separator('Danger zone:'),
                {
                    name: 'Reset knitty settings',
                    value: 'reset',
                },
            ],
        }
    ]).then((answers) => {
        return answers.toConfigure;
    })
}


async function promptConfirmResetSettings() {
    return await inquirer.prompt([
        {
            type: 'confirm',
            message: 'Are you sure you want to reset knitty\'s settings? This means all presets will be deleted.',
            name: 'confirmResetSettings',
            default: false,
        }
    ]).then((answers) => {
        return answers.confirmResetSettings;
    })
}

async function promptConfirmDeletePreset(presetName) {
    return await inquirer.prompt([
        {
            type: 'confirm',
            message: `Are you sure you want to delete preset "${presetName}"?`,
            name: 'confirmDeletePreset',
            default: false,
        }
    ]).then((answers) => {
        return answers.confirmDeletePreset;
    })
}

async function promptManagePresetsCategory() {
    return await inquirer.prompt([
        {
            type: 'list',
            message: 'Which preset category do you want to manage?',
            name: 'presetsToManage',
            choices: [
                {
                    name: 'EditorConfig',
                    value: 'editorConfig'
                },
                new inquirer.Separator(),
                {
                    name: 'Nevermind',
                    value: false,
                },
            ]
        }
    ]).then((answers) => {
        return answers.presetsToManage;
    })
}

async function promptManageEditorConfigPresets() {
    return await inquirer.prompt([
        {
            type: 'list',
            name: 'editorConfigPresetName',
            message: 'Which EditorConfig preset do you want to manage?',
            choices: () => {
                return [
                    ...Object.values(config.get('presets.editorConfig')).map((preset) => {
                        return {
                            name: `${preset.presetName} (${createPresetDescription(preset)})`,
                            value: preset.presetName,
                        }
                    }),
                    new inquirer.Separator,
                    {
                        name: 'Nevermind',
                        value: false,
                    },
                ];
            },
        }
    ]).then((answers) => {
        return answers.editorConfigPresetName;
    });
}

async function promptWhatToDoWithPreset(presetName) {
    return await inquirer.prompt([
        {
            type: 'list',
            message: `What would you like to do with preset "${presetName}"?`,
            name: 'toDoWithPreset',
            choices: [
                {
                    name: 'Delete',
                    value: 'delete',
                },
                new inquirer.Separator(),
                {
                    name: 'Nothing',
                    value: false,
                },
            ]
        }
    ]).then((answers) => {
        return answers.toDoWithPreset;
    })
}

module.exports = configure;