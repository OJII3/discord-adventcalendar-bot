import { describe, expect, test } from "bun:test";
import { type Env, runOnce } from "./index";

const SAMPLE_RSS_WITH_MULTIPLE_SAME_DAY = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="ja-JP" xmlns="http://www.w3.org/2005/Atom" xmlns:re="http://purl.org/atompub/rank/1.0">
  <id>tag:qiita.com,2012:/advent-calendar/2025/tuat/feed</id>
  <link rel="alternate" type="text/html" href="https://qiita.com"/>
  <link rel="self" type="application/atom+xml" href="https://qiita.com/advent-calendar/2025/tuat/feed"/>
  <title>農工大 Advent Calendarの記事 - Qiita</title>
  <updated>2025-12-17T07:26:38+09:00</updated>
  <entry>
    <id>tag:qiita.com,2012:Public::AdventCalendar::CalendarItem/210090</id>
    <published>2025-12-17T07:26:38+09:00</published>
    <updated>2025-12-17T07:27:30+09:00</updated>
    <link rel="alternate" type="text/html" href="https://qiita.com/s252151u/items/351e671333541251e16d"/>
    <title>JAXのJITコンパイルの挙動を完全に理解した</title>
    <content type="text">未熟な点があるかもしれません...</content>
    <author>
      <name>s252151u</name>
    </author>
  </entry>
  <entry>
    <id>tag:qiita.com,2012:Public::AdventCalendar::CalendarItem/212910</id>
    <published>2025-12-17T00:00:00+09:00</published>
    <updated>2025-12-16T18:59:50+09:00</updated>
    <link rel="alternate" type="text/html" href="https://blog.ojii3.dev/2025-12-17-0/"/>
    <title>gwq を nix で入れる</title>
    <content type="text">External article</content>
    <author>
      <name>OJII3</name>
    </author>
  </entry>
  <entry>
    <id>tag:qiita.com,2012:Public::AdventCalendar::CalendarItem/204635</id>
    <published>2025-12-16T07:05:44+09:00</published>
    <updated>2025-12-16T07:05:44+09:00</updated>
    <link rel="alternate" type="text/html" href="https://qiita.com/s217969w/items/49198f1806c73f684adb"/>
    <title>【競プロ】すべてのDP問題に対しメモ化再帰を使ってきた話</title>
    <content type="text">農工大アドカレ16日目です！...</content>
    <author>
      <name>s217969w</name>
    </author>
  </entry>
</feed>`;

describe("runOnce", () => {
	test("should handle multiple articles published on the same day", async () => {
		const env: Env = {
			DISCORD_WEBHOOK_URL: "https://example.com/webhook",
			RSS_FEED_URL: "https://example.com/feed",
		};

		const testDate = new Date("2025-12-17T12:00:00+09:00");
		const postedMessages: string[] = [];

		// Mock fetch to capture Discord webhook calls
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();

			if (url === env.DISCORD_WEBHOOK_URL) {
				const body = JSON.parse(init?.body as string);
				postedMessages.push(body.content);
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}

			return originalFetch(input, init);
		};

		try {
			const result = await runOnce(env, testDate, {
				feedTextOverride: SAMPLE_RSS_WITH_MULTIPLE_SAME_DAY,
				dryRun: false,
			});

			// Should have posted 2 messages for 2 articles on 2025-12-17
			expect(postedMessages.length).toBe(2);
			expect(postedMessages[0]).toContain(
				"JAXのJITコンパイルの挙動を完全に理解した",
			);
			expect(postedMessages[1]).toContain("gwq を nix で入れる");

			expect(result.sent).toBe(true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("should handle single article for a day", async () => {
		const env: Env = {
			DISCORD_WEBHOOK_URL: "https://example.com/webhook",
			RSS_FEED_URL: "https://example.com/feed",
		};

		const testDate = new Date("2025-12-16T12:00:00+09:00");
		const postedMessages: string[] = [];

		// Mock fetch
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();

			if (url === env.DISCORD_WEBHOOK_URL) {
				const body = JSON.parse(init?.body as string);
				postedMessages.push(body.content);
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}

			return originalFetch(input, init);
		};

		try {
			const result = await runOnce(env, testDate, {
				feedTextOverride: SAMPLE_RSS_WITH_MULTIPLE_SAME_DAY,
				dryRun: false,
			});

			// Should have posted 1 message for 1 article on 2025-12-16
			expect(postedMessages.length).toBe(1);
			expect(postedMessages[0]).toContain(
				"【競プロ】すべてのDP問題に対しメモ化再帰を使ってきた話",
			);

			expect(result.sent).toBe(true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
