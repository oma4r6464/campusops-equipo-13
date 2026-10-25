/**
 * Abstraccion minima de sistema de archivos para FileLocalStore.
 * Permite usar Node fs en pruebas, expo-file-system en la app,
 * o un doble con fallas inyectadas para simular caidas.
 */
export interface FileSystem {
  /** Devuelve null si el archivo no existe. */
  readText(path: string): Promise<string | null>;
  /** Escribe y fuerza a disco (fsync) antes de resolver. */
  writeText(path: string, data: string): Promise<void>;
  /** Reemplazo atomico: si destino existe, se sobrescribe. */
  rename(from: string, to: string): Promise<void>;
  /** No falla si el archivo no existe. */
  remove(path: string): Promise<void>;
}
