import { type Env, parseDateString, runOnce } from "./index";

type NodeEnv = Record<string, string | undefined>;

function parseArgs(argv: string[]): { date: Date; dryRun: boolean } {
	let date = new Date();
	let dryRun = false;

	for (const arg of argv) {
		if (arg.startsWith("--date=")) {
			const value = arg.slice("--date=".length);
			date = parseDateString(value);
		}
		if (arg === "--dry-run") {
			dryRun = true;
		}
	}

	return { date, dryRun };
}

type GlobalProcess = {
	env?: NodeEnv;
	argv?: string[];
	exit?: (code?: number) => void;
};

function getProcess(): GlobalProcess | undefined {
	const candidate = (globalThis as { process?: GlobalProcess }).process;
	if (candidate && typeof candidate === "object") {
		return candidate;
	}
	return undefined;
}

async function main() {
	const proc = getProcess();
	const envVars = proc?.env ?? {};
	const webhook = envVars.DISCORD_WEBHOOK_URL;
	if (!webhook) {
		throw new Error("DISCORD_WEBHOOK_URL is required");
	}

	const args = parseArgs(proc?.argv ?? []);
	const env: Env = {
		DISCORD_WEBHOOK_URL: webhook,
		RSS_FEED_URL: envVars.RSS_FEED_URL,
		DRY_RUN: envVars.DRY_RUN,
	};

	const result = await runOnce(env, args.date, {
		dryRun: args.dryRun || envVars.DRY_RUN === "true",
	});

	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error);
	getProcess()?.exit?.(1);
});
