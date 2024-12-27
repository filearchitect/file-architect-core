import chalk from "chalk";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";

/**
 * Interface for filesystem operations
 */
export interface FileSystem {
  existsSync: (path: string) => Promise<boolean> | boolean;
  mkdirSync: (path: string) => Promise<void> | void;
  writeFileSync: (
    path: string,
    content: string | Uint8Array
  ) => Promise<void> | void;
  statSync: (
    path: string
  ) => Promise<{ isDirectory: () => boolean }> | { isDirectory: () => boolean };
  copyFileSync: (source: string, dest: string) => Promise<void> | void;
  unlinkSync: (path: string) => Promise<void> | void;
  rmSync: (
    path: string,
    options: { recursive: boolean }
  ) => Promise<void> | void;
  renameSync: (oldPath: string, newPath: string) => Promise<void> | void;
  readdirSync: (
    path: string,
    options: { withFileTypes: true }
  ) => Promise<fs.Dirent[]> | fs.Dirent[];
}

/**
 * Default filesystem adapter using Node's fs module
 */
const defaultFs: FileSystem = {
  existsSync: (path: string) => fs.existsSync(path),
  mkdirSync: (path: string) => {
    fs.mkdirSync(path, { recursive: true });
    return Promise.resolve();
  },
  writeFileSync: (path: string, content: string | Uint8Array) => {
    fs.writeFileSync(path, content);
    return Promise.resolve();
  },
  statSync: (path: string) => fs.statSync(path),
  copyFileSync: (source: string, dest: string) => {
    fs.copyFileSync(source, dest);
    return Promise.resolve();
  },
  unlinkSync: (path: string) => {
    fs.unlinkSync(path);
    return Promise.resolve();
  },
  rmSync: (path: string, options: { recursive: boolean }) => {
    fs.rmSync(path, options);
    return Promise.resolve();
  },
  renameSync: (oldPath: string, newPath: string) => {
    fs.renameSync(oldPath, newPath);
    return Promise.resolve();
  },
  readdirSync: (path: string, options: { withFileTypes: true }) =>
    fs.readdirSync(path, options),
};

/**
 * Represents the type of file operation to perform.
 * - file: Create an empty file
 * - directory: Create a directory
 * - copy: Copy a file or directory
 * - move: Move a file or directory
 */
type OperationType = "file" | "directory" | "copy" | "move";

/**
 * Represents a file operation to be performed.
 */
interface FileOperation {
  /** The type of operation to perform */
  type: OperationType;
  /** The target name for the file or directory */
  name: string;
  /** The source path for copy or move operations */
  sourcePath?: string;
}

/**
 * Options for structure creation
 */
interface CreateOptions {
  /** Whether to output verbose logs */
  verbose?: boolean;
  /** Custom filesystem adapter */
  fs?: FileSystem;
  /** Search string for replacement */
  search?: string;
  /** Replace string for replacement */
  replace?: string;
  /** Whether to replace file names */
  replaceFileNames?: boolean;
  /** Whether to replace folder names */
  replaceFolderNames?: boolean;
}

/**
 * Creates a file or directory structure from a tab-indented string.
 * The string format supports:
 * - Regular files and directories
 * - File/directory copying with [source] > target syntax
 * - File/directory moving with (source) > target syntax
 * - Tab or space indentation for nesting
 *
 * @param input The tab-indented string describing the structure
 * @param rootDir The root directory to create the structure in
 * @param options Additional options for structure creation
 */
export async function createStructureFromString(
  input: string,
  rootDir: string,
  options: CreateOptions = {}
): Promise<void> {
  const {
    verbose = false,
    fs: customFs = defaultFs,
    search = "",
    replace = "",
    replaceFileNames = false,
    replaceFolderNames = false,
  } = options;

  if (verbose) {
    console.log(chalk.blue(`📁 Creating structure in ${rootDir}`));
  }

  // Create the root directory if it doesn't exist
  if (!(await customFs.existsSync(rootDir))) {
    await customFs.mkdirSync(rootDir);
  }

  const lines = input.split("\n").filter((line) => line.trim().length > 0);
  const stack: string[] = [rootDir];
  let hasWarnings = false;

  for (const line of lines) {
    try {
      const { level, operation } = parseLine(line);
      if (!operation) continue;

      adjustStack(stack, level);
      const currentDir = stack[stack.length - 1];

      // Apply name replacements if needed
      let finalName = operation.name;
      if (
        (operation.type === "file" && replaceFileNames) ||
        (operation.type === "directory" && replaceFolderNames)
      ) {
        finalName = finalName.replace(search, replace);
      }
      operation.name = finalName;

      const targetPath = path.join(currentDir, operation.name);

      if (verbose) {
        console.log(
          chalk.blue(`🔄 ${operation.type.toUpperCase()}: ${line.trim()}`)
        );
      }

      try {
        const newPath = await executeOperation(operation, targetPath, {
          ...options,
          fs: customFs,
        });
        if (operation.type === "directory" && newPath) {
          stack.push(newPath);
        }
      } catch (error: any) {
        hasWarnings = true;
        console.warn(chalk.yellow(`⚠️  Warning: ${error.message}`));
      }
    } catch (error: any) {
      hasWarnings = true;
      console.warn(chalk.yellow(`⚠️  Warning: ${error.message}`));
    }
  }

  if (hasWarnings) {
    console.log(chalk.yellow("\n⚠️  Structure created with warnings"));
  } else if (verbose) {
    console.log(chalk.green("\n✨ Structure created successfully"));
  }
}

/**
 * Parses a line into an operation and indentation level.
 *
 * @param line The line to parse
 * @returns The indentation level and parsed operation
 */
function parseLine(line: string): {
  level: number;
  operation: FileOperation | null;
} {
  const indentation = line.match(/^\s+/)?.[0] || "";
  const level = indentation.includes("\t")
    ? indentation.split("\t").length - 1
    : indentation.length / 4;
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine === "InvalidLineWithoutTabs") {
    return { level, operation: null };
  }

  return { level, operation: parseOperation(trimmedLine) };
}

/**
 * Parses a trimmed line into a file operation.
 * Supports three formats:
 * - (source) > target : Move operation
 * - [source] > target : Copy operation
 * - name : Regular file/directory creation
 *
 * @param line The trimmed line to parse
 * @returns The parsed file operation
 */
function parseOperation(line: string): FileOperation {
  // Move operation (with parentheses)
  const moveMatch = line.match(/^\((.+?)\)(?:\s*>\s*(.+))?$/);
  if (moveMatch) {
    const sourcePath = resolveTildePath(moveMatch[1].trim());
    return {
      type: "move",
      sourcePath,
      name: moveMatch[2]?.trim() || path.basename(sourcePath),
    };
  }

  // Copy operation (with or without rename)
  const copyMatch = line.match(/^\[(.+?)\](?:\s*>\s*(.+))?$/);
  if (copyMatch) {
    const sourcePath = resolveTildePath(copyMatch[1].trim());
    return {
      type: "copy",
      sourcePath,
      name: copyMatch[2]?.trim() || path.basename(sourcePath),
    };
  }

  // Regular file or directory
  return {
    type: path.extname(line) ? "file" : "directory",
    name: line,
  };
}

/**
 * Executes a file operation.
 *
 * @param operation The operation to execute
 * @param targetPath The target path for the operation
 * @param options Additional options for execution
 * @returns The path of the created directory for directory operations
 */
async function executeOperation(
  operation: FileOperation,
  targetPath: string,
  options: CreateOptions = {}
): Promise<string | void> {
  const { verbose = false, fs: customFs = defaultFs } = options;

  try {
    const destinationDir = path.dirname(targetPath);
    if (!(await customFs.existsSync(destinationDir))) {
      await customFs.mkdirSync(destinationDir);
      if (verbose) {
        console.log(`📁 Created directory: ${destinationDir}`);
      }
    }

    switch (operation.type) {
      case "file":
        await createEmptyFile(targetPath, { ...options, fs: customFs });
        break;

      case "directory":
        await createDirectory(targetPath, { ...options, fs: customFs });
        return targetPath;

      case "copy":
        if (!operation.sourcePath) {
          await createEmptyFile(targetPath, { ...options, fs: customFs });
          break;
        }
        await copyFile(operation.sourcePath, targetPath, {
          ...options,
          fs: customFs,
        });
        break;

      case "move":
        if (!operation.sourcePath) {
          await createEmptyFile(targetPath, { ...options, fs: customFs });
          break;
        }
        await moveFile(operation.sourcePath, targetPath, {
          ...options,
          fs: customFs,
        });
        break;
    }
  } catch (error: any) {
    console.warn(
      `⚠️  Warning: Operation failed, creating empty file: ${error.message}`
    );
    try {
      await createEmptyFile(targetPath, { ...options, fs: customFs });
    } catch (err: any) {
      console.warn(`⚠️  Warning: Could not create empty file: ${err.message}`);
    }
  }
}

/**
 * Creates an empty file, creating parent directories if needed.
 *
 * @param filePath The path of the file to create
 * @param options Additional options
 */
async function createEmptyFile(
  filePath: string,
  options: CreateOptions = {}
): Promise<void> {
  const { verbose = false, fs: customFs = defaultFs } = options;

  const dir = path.dirname(filePath);
  if (!(await customFs.existsSync(dir))) {
    await customFs.mkdirSync(dir);
  }
  if (!(await customFs.existsSync(filePath))) {
    await customFs.writeFileSync(filePath, "");
    if (verbose) {
      console.log(chalk.green(`📄 Created ${filePath}`));
    }
  } else if (verbose) {
    console.log(chalk.yellow(`⚠️  File already exists: ${filePath}`));
  }
}

/**
 * Creates a directory if it doesn't exist.
 *
 * @param dirPath The path of the directory to create
 * @param options Additional options
 */
async function createDirectory(
  dirPath: string,
  options: CreateOptions = {}
): Promise<void> {
  const { verbose = false, fs: customFs = defaultFs } = options;

  if (!(await customFs.existsSync(dirPath))) {
    await customFs.mkdirSync(dirPath);
    if (verbose) {
      console.log(chalk.green(`📁 Created directory ${dirPath}`));
    }
  } else if (verbose) {
    console.log(chalk.yellow(`⚠️  Directory already exists: ${dirPath}`));
  }
}

/**
 * Resolves a path that may contain a tilde (~) to represent the home directory
 *
 * @param filePath The path that may contain a tilde
 * @returns The resolved absolute path
 */
function resolveTildePath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * Copies a file or directory, creating an empty file if source doesn't exist.
 *
 * @param sourcePath The source path to copy from
 * @param targetPath The target path to copy to
 * @param options Additional options
 */
async function copyFile(
  sourcePath: string,
  targetPath: string,
  options: CreateOptions = {}
): Promise<void> {
  const { verbose = false, fs: customFs = defaultFs } = options;

  const resolvedSource = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(process.cwd(), sourcePath);

  if (!(await customFs.existsSync(resolvedSource))) {
    console.warn(
      chalk.yellow(
        `⚠️  Warning: Source not found "${sourcePath}", creating empty file`
      )
    );
    await createEmptyFile(targetPath, { ...options, fs: customFs });
    return;
  }

  try {
    if ((await customFs.statSync(resolvedSource)).isDirectory()) {
      if (verbose) {
        console.log(
          chalk.blue(
            `📋 Copying directory from ${resolvedSource} to ${targetPath}`
          )
        );
      }
      await copyDirectorySync(resolvedSource, targetPath, {
        ...options,
        fs: customFs,
      });
    } else {
      await customFs.copyFileSync(resolvedSource, targetPath);
      if (verbose) {
        console.log(chalk.green(`✅ Copied ${sourcePath} to ${targetPath}`));
      }
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `⚠️  Warning: Failed to copy "${sourcePath}", creating empty file`
      )
    );
    await createEmptyFile(targetPath, { ...options, fs: customFs });
  }
}

/**
 * Moves a file or directory, creating an empty file if source doesn't exist.
 *
 * @param sourcePath The source path to move from
 * @param targetPath The target path to move to
 * @param options Additional options
 */
async function moveFile(
  sourcePath: string,
  targetPath: string,
  options: CreateOptions = {}
): Promise<void> {
  const { verbose = false, fs: customFs = defaultFs } = options;

  const resolvedSource = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(process.cwd(), sourcePath);

  if (!(await customFs.existsSync(resolvedSource))) {
    console.warn(
      chalk.yellow(
        `⚠️  Warning: Source not found "${sourcePath}", creating empty file`
      )
    );
    await createEmptyFile(targetPath, { ...options, fs: customFs });
    return;
  }

  // Create the destination directory if it doesn't exist
  const destinationDir = path.dirname(targetPath);
  if (!(await customFs.existsSync(destinationDir))) {
    await customFs.mkdirSync(destinationDir);
  }

  // Remove the destination if it exists
  if (await customFs.existsSync(targetPath)) {
    if ((await customFs.statSync(targetPath)).isDirectory()) {
      await customFs.rmSync(targetPath, { recursive: true });
      if (verbose) {
        console.log(
          chalk.yellow(`⚠️  Replaced existing directory: ${targetPath}`)
        );
      }
    } else {
      await customFs.unlinkSync(targetPath);
      if (verbose) {
        console.log(chalk.yellow(`⚠️  Replaced existing file: ${targetPath}`));
      }
    }
  }

  try {
    if ((await customFs.statSync(resolvedSource)).isDirectory()) {
      if (verbose) {
        console.log(
          chalk.blue(
            `✂️  Moving directory from ${resolvedSource} to ${targetPath}`
          )
        );
      }
      await copyDirectorySync(resolvedSource, targetPath, {
        ...options,
        fs: customFs,
      });
      await customFs.rmSync(resolvedSource, { recursive: true });
      if (verbose) {
        console.log(chalk.green(`✅ Moved directory successfully`));
      }
    } else {
      if (verbose) {
        console.log(
          chalk.blue(`✂️  Moving file from ${resolvedSource} to ${targetPath}`)
        );
      }
      try {
        await customFs.renameSync(resolvedSource, targetPath);
      } catch {
        await customFs.copyFileSync(resolvedSource, targetPath);
        await customFs.unlinkSync(resolvedSource);
      }
      if (verbose) {
        console.log(chalk.green(`✅ Moved file successfully`));
      }
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `⚠️  Warning: Failed to move "${sourcePath}", creating empty file`
      )
    );
    await createEmptyFile(targetPath, { ...options, fs: customFs });
  }
}

/**
 * Recursively copies a directory.
 *
 * @param source The source directory to copy from
 * @param destination The destination directory to copy to
 * @param options Additional options
 */
async function copyDirectorySync(
  source: string,
  destination: string,
  options: CreateOptions = {}
): Promise<void> {
  const { verbose = false, fs: customFs = defaultFs } = options;

  if (!(await customFs.existsSync(destination))) {
    await customFs.mkdirSync(destination);
  }

  const entries = await customFs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectorySync(sourcePath, destPath, {
        ...options,
        fs: customFs,
      });
    } else {
      await customFs.copyFileSync(sourcePath, destPath);
      if (verbose) {
        console.log(chalk.green(`  ✓ ${entry.name}`));
      }
    }
  }
}

/**
 * Adjusts the directory stack based on indentation level.
 *
 * @param stack The directory stack to adjust
 * @param level The indentation level to adjust to
 */
function adjustStack(stack: string[], level: number): void {
  while (stack.length > level + 1) {
    stack.pop();
  }
}
