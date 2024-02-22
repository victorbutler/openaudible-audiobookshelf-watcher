import dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import fs from 'node:fs';
import yargs from 'yargs/yargs';
import util from 'node:util';
import colors from 'colors-cli/safe';
import { copyFile, watch } from 'node:fs/promises';

import type { Book, Books } from './app.types.js';

dotenv.config();

const error = colors.red.bold,
  notice = colors.blue;

type Arguments =
  | {
      [x: string]: unknown;
      input: string;
      output: string;
      template: string;
      _: (string | number)[];
      $0: string;
    }
  | {
      [x: string]: unknown;
      input: string;
      output: string;
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
      // Copy audio files to output, if the input file exists
      const copyPromises = book.files
        .filter((f) => f.kind === 'audio')
        .map((f) => path.join(argv.input, 'books', f.path))
        .map((f) => {
          if (existsSync(f)) {
            return copyFile(f, path.join(outputPath, path.basename(f)));
          } else {
            throw new Error(`File not found: ${f}`);
          }
        });
      await Promise.all(copyPromises);
      const msg = `✅ ${book.title} processed successfully`;
      console.log(notice(msg));
      return msg;
    } catch (e) {
      const msg = `❌ Error processing ${book.title}`;
      console.error(error(msg), e);
      return msg;
    }
  };
}

export async function ProcessBooks(booksPath: string, argv: Arguments) {
  // Read and collect book objects
  const books = JSON.parse(fs.readFileSync(booksPath).toString()) as Books;
  // Compose input / output mapping
  await Promise.all(books.map(ProcessBook(argv)));
}

async function App(): Promise<void> {
  // Get input and output paths
  const argv = await ProcessArgs(process.argv.slice(2));
  // Look for books.json in input
  const booksPath = path.join(argv.input, 'books.json');
  if (existsSync(booksPath)) {
    // Watch books.json for changes
    const watcher = watch(booksPath);
    for await (const event of watcher) {
      if (event.filename) {
        await ProcessBooks(booksPath, argv);
      }
    }
    await ProcessBooks(booksPath, argv);
  } else {
    throw new Error(`books.json not found in input: ${argv.input}`);
  }
}

App();
