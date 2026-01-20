import { Command } from 'commander';
import { createAuthCommand } from './commands/auth.js';
import { createDatabaseCommand } from './commands/database.js';
import { createPageCommand } from './commands/page.js';
import { createSearchCommand } from './commands/search.js';
import { createBlockCommand } from './commands/block.js';
import { handleError } from './lib/errors.js';
import type { OutputFormat } from './types/index.js';
import pkg from '../package.json' assert { type: 'json' };

const program = new Command();

program
  .name('onotion')
  .description('A modern, full-featured Notion CLI')
  .version(pkg.version)
  .option('-o, --output <format>', 'Output format: table, json, plain', 'table')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--config <path>', 'Path to config directory')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    const validFormats: OutputFormat[] = ['table', 'json', 'plain'];
    if (options.output && !validFormats.includes(options.output as OutputFormat)) {
      console.error(`Invalid output format: ${options.output}. Valid formats: ${validFormats.join(', ')}`);
      process.exit(1);
    }
  });

// Add commands
program.addCommand(createAuthCommand());
program.addCommand(createDatabaseCommand());
program.addCommand(createPageCommand());
program.addCommand(createSearchCommand());
program.addCommand(createBlockCommand());

// Error handling
process.on('uncaughtException', (error) => {
  handleError(error, program.opts().verbose);
});

process.on('unhandledRejection', (reason) => {
  handleError(reason, program.opts().verbose);
});

// Parse and execute
program.parseAsync(process.argv).catch((error) => {
  handleError(error, program.opts().verbose);
});
