# File Architect Core

Core functionality for File Architect, a tool that helps you create file structures from text descriptions.

## Installation

```bash
npm install file-architect-core
```

## Usage

### Basic Usage

```typescript
import { createStructureFromString } from "file-architect-core";

const structure = `
project
    src
        index.js
        components
            Button.tsx
    tests
        index.test.js
`;

await createStructureFromString(structure, "./output", {
  verbose: true,
  search: "old",
  replace: "new",
  replaceFileNames: true,
  replaceFolderNames: false,
});
```

### Custom Filesystem Adapter

You can provide a custom filesystem adapter to use different filesystem implementations (e.g., Tauri's filesystem API):

```typescript
import { createStructureFromString, FileSystem } from "file-architect-core";
import { create, exists, writeFile } from "@tauri-apps/plugin-fs";

// Create a custom filesystem adapter
const tauriFs: FileSystem = {
  existsSync: async (path: string) => {
    return await exists(path);
  },
  mkdirSync: async (path: string) => {
    await create(path, { baseDir: BaseDirectory.Home });
  },
  writeFileSync: async (path: string, content: string | Uint8Array) => {
    await writeFile(path, content);
  },
  // ... implement other required methods
};

// Use the custom filesystem adapter
await createStructureFromString(structure, "./output", {
  verbose: true,
  fs: tauriFs, // Pass your custom filesystem adapter
});
```

## Features

- Create files and directories from a text description
- Support for nested structures with indentation (4 spaces or tabs)
- Find and replace in file and folder names
- Selective replacement for files or folders only
- Custom filesystem adapter support for different environments

## Options

The `createStructureFromString` function accepts the following options:

```typescript
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
```

### Filesystem Adapter Interface

If you want to provide a custom filesystem adapter, it must implement the following interface:

```typescript
interface FileSystem {
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
```

## License

MIT
