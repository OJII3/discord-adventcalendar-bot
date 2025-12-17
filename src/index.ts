export interface Env {
	DISCORD_WEBHOOK_URL: string;
	RSS_FEED_URL?: string;
	DRY_RUN?: string;
}

type RssItem = {
	title: string;
	link: string;
	pubDate?: string;
};

const TIME_ZONE = "Asia/Tokyo";

type ProcessOptions = {
	feedTextOverride?: string;
	dryRun?: boolean;
};

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return new Response("ok");
		}

		return new Response("Not Found", { status: 404 });
	},

	async scheduled(env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			runOnce(env, new Date()).catch((error) => {
				console.error("scheduled run error", error);
			}),
		);
	},
};

export async function runOnce(
	env: Env,
	now: Date,
	options: ProcessOptions = {},
) {
	const feedUrl = env.RSS_FEED_URL;
	if (!feedUrl) {
		throw new Error("RSS_FEED_URL is not configured");
	}

	const feedText = options.feedTextOverride ?? (await fetchRss(feedUrl));
	const items = parseRss(feedText);
	const isDryRun = options.dryRun ?? env.DRY_RUN === "true";

	const todayKey = formatDay(now, TIME_ZONE);
	const todaysItems = items.filter((item) => {
		const published = parseDate(item.pubDate);
		if (!published) return false;
		return formatDay(published, TIME_ZONE) === todayKey;
	});

	if (todaysItems.length === 0) {
		console.log("No entries for", todayKey);
		return { sent: false, reason: "no-entry-for-today", day: todayKey };
	}

	// Post all articles for today
	for (const item of todaysItems) {
		const message = buildDiscordMessage(item, todayKey);
		if (isDryRun) {
			console.log("[dry-run] would post:", message);
		} else {
			await postToDiscord(env.DISCORD_WEBHOOK_URL, message);
		}
	}

	return {
		sent: !isDryRun,
		dryRun: isDryRun,
		count: todaysItems.length,
		day: todayKey,
	};
}

async function fetchRss(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			"User-Agent": "discord-adventcalendar-bot/1.0",
		},
	});

	if (!response.ok) {
		throw new Error(
			`RSS fetch failed: ${response.status} ${response.statusText}`,
		);
	}

	return await response.text();
}

function parseRss(xml: string): RssItem[] {
	const items: RssItem[] = [];
	const itemRegex = /<item[\s\S]*?<\/item>/gi;
	const entryRegex = /<entry[\s\S]*?<\/entry>/gi;

	for (const match of xml.matchAll(itemRegex)) {
		const block = match[0] ?? "";
		const title = extractTag(block, "title");
		const link = extractTag(block, "link");
		const pubDate =
			extractTag(block, "pubDate") ||
			extractTag(block, "dc:date") ||
			extractTag(block, "updated");

		if (title && link) {
			items.push({ title, link, pubDate });
		}
	}

	for (const match of xml.matchAll(entryRegex)) {
		const block = match[0] ?? "";
		const title = extractTag(block, "title");
		const link =
			extractAttr(block, "link", "href") ||
			extractTag(block, "link") ||
			undefined;
		const pubDate =
			extractTag(block, "published") ||
			extractTag(block, "updated") ||
			extractTag(block, "dc:date");

		if (title && link) {
			items.push({ title, link, pubDate });
		}
	}

	return items;
}

function extractTag(xml: string, tag: string): string | undefined {
	const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
	const match = regex.exec(xml);
	if (!match) return undefined;
	return decodeEntities(match[1].trim());
}

function extractAttr(
	xml: string,
	tag: string,
	attr: string,
): string | undefined {
	const regex = new RegExp(`<${tag}[^>]*?\\s${attr}="([^"]+)"`, "i");
	const match = regex.exec(xml);
	if (!match) return undefined;
	return decodeEntities(match[1].trim());
}

function decodeEntities(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function parseDate(value?: string): Date | undefined {
	if (!value) return undefined;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed;
}

function formatDay(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
	return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function parseDateString(input: string): Date {
	// Accepts YYYY-MM-DD and uses midnight in the configured time zone
	const [year, month, day] = input
		.split("-")
		.map((p) => Number.parseInt(p, 10));
	if (!year || !month || !day) throw new Error(`Invalid date: ${input}`);
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	return utcDate;
}

function buildDiscordMessage(item: RssItem, dayKey: string): string {
	return [
		`📅 農工大アドベントカレンダー2025: ${dayKey} の記事です！:`,
		`• ${item.title}`,
		item.link,
	].join("\n");
}

async function postToDiscord(
	webhookUrl: string,
	content: string,
): Promise<void> {
	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ content }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Discord webhook failed: ${response.status} ${errorText}`);
	}
}
