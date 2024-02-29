import dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import fs from 'node:fs';
import yargs from 'yargs/yargs';
import util from 'node:util';
import colors from 'colors-cli/safe';
import { copyFile, stat } from 'node:fs/promises';
import { watch } from 'chokidar';
import pkg from '../package.json' with { type: 'json' };

import type { Book, Books } from './app.types.js';

dotenv.config();

const error = colors.red.bold,
  warning = colors.yellow,
  notice = colors.blue,
  info = colors.white.faint,
  system = colors.blink.magenta;

type Arguments = {
  [x: string]: unknown;
  input: string;
  output: string;
  poll: boolean;
  template: string;
  _: (string | number)[];
  $0: string;
};

export async function ProcessArgs(originalArgs: string[]): Promise<Arguments> {
  const argParser = yargs(originalArgs)
    .scriptName('app.js')
    .usage('$0 [args]')
    .options({
      input: {
        type: 'string',
        demandOption: true,
        default: process.env.INPUT,
        describe: 'OpenAudible directory that contains books.json',
      },
      output: {
        type: 'string',
        demandOption: true,
        default: process.env.OUTPUT,
        describe: 'AudioBookshelf directory that contains all your audiobooks',
      },
      poll: {
        type: 'boolean',
        default: !!process.env.POLL || false,
        describe:
          "Switch watch method to poll instead of event based (use this if changes don't trigger updates)",
      },
      template: {
        type: 'string',
        default: '{author}/{title_short}',
        describe: 'Output directory structure',
      },
    })
    .check((argv) => {
      const errors = [];
      if (existsSync(argv.input) === false) {
        errors.push(`Input could not be found: ${argv.input}`);
      }
      if (existsSync(argv.output) === false) {
        errors.push(`Output could not be found: ${argv.output}`);
      }
      if (
        existsSync(argv.input) &&
        existsSync(argv.output) &&
        argv.input === argv.output
      ) {
        errors.push(`Input and output cannot be identical: ${argv.input}`);
      }
      if (errors.length) {
        return errors.join('\n');
      }
      return argv;
    });
  const argv = await argParser.parse();

  return argv;
}

export function ProcessBook(argv: Arguments) {
  return async function (book: Book): Promise<string> {
    try {
      // Search `template` string for {var} format and prepare vars
      const vars = [...argv.template.matchAll(/\{[\w_]+\}/g)].map((clean) =>
        clean[0].substring(1, clean[0].length - 1),
      );
      // Narrow down all the values to the ones requested in `template`
      const values = Object.keys(book)
        .filter((v) => vars.includes(v))
        .map((v) => String(book[v]));
      // Compose a path for this book using the `template` pattern and values derrived
      const outputPath = path.join(
        argv.output,
        util.format(argv.template.replaceAll(/\{[\w_]+\}/g, '%s'), ...values),
      );
      // Make the directory, if it doesn't exist
      existsSync(outputPath) === false &&
        mkdirSync(outputPath, { recursive: true });
      // Before we copy, check: 1) if destination file exists, 2) if the file sizes differ
      const sourceFiles = book.files
        .filter((f) => f.kind === 'audio')
        .map((f) => {
          return {
            input: path.join(argv.input, 'books', f.path),
            output: path.join(outputPath, path.basename(f.path)),
          };
        });
      // Copy audio files to output, if the input file exists
      const copyPromises = sourceFiles.map(async (f) => {
        try {
          if (existsSync(f.input)) {
            // TODO: there's some repetition here...
            if (existsSync(f.output)) {
              const inputStats = await stat(f.input, { bigint: true });
              const outputStats = await stat(f.output, { bigint: true });
              if (inputStats.size !== outputStats.size) {
                console.log(warning(`⏳ ${book.title_short}: Copying ...`));
                await copyFile(f.input, f.output);
                const outputStats = await stat(f.output, { bigint: true });
                const sizeMB = outputStats.size / 1024n / 1024n;
                console.log(
                  warning(
                    `✅ ${book.title_short}: Copied ${sizeMB}MB successfully`,
                  ),
                );
              } else {
                console.log(info(`⏩ ${book.title_short}: Skipped copying`));
              }
            } else {
              console.log(warning(`⏳ ${book.title_short}: Copying ...`));
              await copyFile(f.input, f.output);
              const outputStats = await stat(f.output, { bigint: true });
              const sizeMB = outputStats.size / 1024n / 1024n;
              console.log(
                warning(
                  `✅ ${book.title_short}: Copied ${sizeMB}MB successfully`,
                ),
              );
            }
            return;
          } else {
            throw new Error(`File not found: ${f.input}`);
          }
        } catch (e) {
          console.error(
            error(
              `❌ ${book.title_short}: Copy task failed for ${f.input} -> ${f.output}`,
            ),
            e,
          );
        }
      });
      await Promise.all(copyPromises);
      const msg = `✅ ${book.title_short}: processed successfully`;
      return msg;
    } catch (e) {
      const msg = `❌ ${book.title_short}: Error processing book`;
      console.error(error(msg), e);
      return msg;
    }
  };
}

export async function ProcessBooks(
  booksJsonPath: string,
  argv: Arguments,
): Promise<void> {
  // Read and collect book objects
  const books = JSON.parse(fs.readFileSync(booksJsonPath).toString()) as Books;
  // Compose input / output mapping
  await Promise.all(books.map(ProcessBook(argv)));
}

async function App(): Promise<void> {
  // Get input and output paths
  const argv = await ProcessArgs(process.argv.slice(2));
  // Startup
  console.log(
    system(
      `Starting up v${
        pkg.version
      } at ${new Date().toISOString()} with options:`,
    ),
  );
  console.log(system(`  input: ${argv.input}`));
  console.log(system(`  output: ${argv.output}`));
  console.log(system(`  poll: ${argv.poll}`));
  console.log(system(`  template: ${argv.template}`));
  // Look for books.json in input
  const booksJsonPath = path.join(argv.input, 'books.json');
  const booksDir = path.join(argv.input, 'books');
  if (existsSync(booksJsonPath)) {
    // Process books immediately
    await ProcessBooks(booksJsonPath, argv);
    // Watch books for changes
    console.log(notice(`🔎 Watching books at: ${booksDir}`));

    const watchDir = watch(booksDir, {
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
      // Consider polling to work around lack of WSL and Docker volume mapping support
      usePolling: argv.poll,
      ignoreInitial: true,
    });
    const watchThis = async (
      event: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir',
      filename: string,
    ): Promise<void> => {
      console.log(
        notice(`🔔 ${filename} ${event} at ${new Date().toISOString()}`),
      );
      await ProcessBooks(booksJsonPath, argv);
    };
    watchDir.on('all', watchThis);
    // Handle Crtl+C
    process.on('SIGINT', () => {
      console.log(system(`Shutting down at ${new Date().toISOString()}`));
      watchDir.off('all', watchThis);
      process.exit(0);
    });
  } else {
    throw new Error(`books.json not found in input: ${argv.input}`);
  }
}

App();
