#!/usr/bin/env node
import { Command } from 'commander/esm.mjs';
import create from './../lib/create.mjs';

const program = new Command();
program
	.command('create')
	.description('create a new web project')
	.action(create);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
