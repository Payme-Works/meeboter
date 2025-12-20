import { StorageError } from "./storage-error";

/**
 * Error thrown when file is not found.
 */
export class FileNotFoundError extends StorageError {
	constructor(filePath: string) {
		super(`File not found: ${filePath}`, "FILE_NOT_FOUND", { filePath });
		this.name = "FileNotFoundError";
	}
}
