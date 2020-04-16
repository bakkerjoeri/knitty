const execa = require('execa');
const path = require('path');

async function isPathGitRepository(pathName) {
    let repositoryRoot = await execa.command('git rev-parse --show-toplevel', { cwd: pathName }).catch(() => {
        return;
    });

    return repositoryRoot === path.resolve(pathName);
}

module.exports = isPathGitRepository;
