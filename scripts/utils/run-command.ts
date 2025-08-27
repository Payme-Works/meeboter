import { spawn } from "child_process";

/**
 * Runs a command and returns a promise.
 * @param command - The command to run.
 * @param options - The options to pass to the command.
 * @returns A promise that resolves when the command exits.
 */
export async function runCommand(
	command: string,
	args: string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
	} = {},
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			env: {
				...process.env,
				...options.env,
			},
			cwd: options.cwd,
			shell: true,
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`Command "${command} ${args.join(" ")}" exited with code ${code}`,
					),
				);
			}
		});

		child.on("error", reject);
	});
}
