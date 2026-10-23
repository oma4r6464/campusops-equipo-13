import { promises as fs } from 'node:fs';
import type { FileSystem } from './fileSystem';

/** Implementacion Node (pruebas / herramientas). No importar desde la app RN. */
export const nodeFileSystem: FileSystem = {
  async readText(path) {
    try {
      return await fs.readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
  async writeText(path, data) {
    const handle = await fs.open(path, 'w');
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  async rename(from, to) {
    await fs.rename(from, to);
  },
  async remove(path) {
    await fs.rm(path, { force: true });
  },
};
