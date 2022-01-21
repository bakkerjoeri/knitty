import {execa} from 'execa';
import {resolve} from 'path';

async function isPathGitRepository(pathName) {
	let repositoryRoot = await execa('git rev-parse --show-toplevel', { cwd: pathName }).catch(() => {
		return;
	});

	return repositoryRoot === resolve(pathName);
}

export default isPathGitRepository;
