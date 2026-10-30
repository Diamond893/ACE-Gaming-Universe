const sharp = require("sharp");
const https = require("https");

const { getDeckCosmetics } = require("../../core/monthlyPass");

// Deck canvas
const WIDTH = 1200;
const HEIGHT = 1240;

// Grid
const COLUMNS = 4;
const CARD_WIDTH = 260;
const CARD_HEIGHT = 326;
const GAP = 22;

const START_X = 47;
const START_Y = 153;

// Cache resized card thumbnails in memory.
// This reduces repeated downloads when players view decks.
const thumbnailCache = new Map();
const MAX_CACHE_ITEMS = 36;

function escapeXml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function shorten(value, length = 21) {
    const text = String(value || "Unknown");
    const chars = Array.from(text);

    return chars.length > length
        ? chars.slice(0, length - 1).join("") + "…"
        : text;
}

function tierLabel(value) {
    const tier = String(value ?? "")
        .trim()
        .toUpperCase();

    if (["S", "TS", "TIER S"].includes(tier)) {
        return "Tier: Special";
    }

    const match = tier.match(/^(?:TIER\s*|T)?(\d+)$/);

    return match ? `Tier: ${match[1]}` : `Tier: ${tier || "?"}`;
}

// Download an HTTPS image with a size limit.
// A card fetch should never keep the bot waiting indefinitely.
function downloadImage(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (
            !url ||
            typeof url !== "string" ||
            !/^https:\/\//i.test(url)
        ) {
            return reject(new Error("Invalid card image URL"));
        }

        if (redirects > 3) {
            return reject(new Error("Too many redirects"));
        }

        let settled = false;

        const fail = error => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        const request = https.get(url, {
            timeout: 12000,
            headers: {
                "User-Agent": "AGU-NYX-Deck/1.0"
            }
        }, response => {

            const status = response.statusCode || 0;

            if (status >= 300 && status < 400 && response.headers.location) {
                const redirect = new URL(
                    response.headers.location,
                    url
                ).toString();

                response.resume();

                downloadImage(redirect, redirects + 1)
                    .then(resolve)
                    .catch(reject);

                return;
            }

            if (status !== 200) {
                response.resume();
                return fail(
                    new Error(`Image HTTP ${status}`)
                );
            }

            const chunks = [];
            let total = 0;

            response.on("data", chunk => {
                if (settled) return;

                total += chunk.length;

                if (total > 50 * 1024 * 1024) {
                    fail(new Error("Card image exceeds 50 MB"));
                    response.destroy();
                    return;
                }

                chunks.push(chunk);
            });

            response.on("end", () => {
                if (settled) return;

                settled = true;
                resolve(Buffer.concat(chunks));
            });

            response.on("error", fail);
        });

        request.on("timeout", () => {
            request.destroy(
                new Error("Card image download timed out")
            );
        });

        request.on("error", fail);
    });
}

async function getThumbnail(card) {
    const url = card.image;

    if (!url) {
        return null;
    }

    const cached = thumbnailCache.get(url);

    if (cached) {
        return cached;
    }

    const source = await downloadImage(url);

    // Important:
    // Decode only the first frame of animated GIF/WebP.
    // Free decks must remain static.
    const thumbnail = await sharp(source, {
        animated: false,
        limitInputPixels: 30000000
    })
        .resize(250, 275, {
            fit: "contain",
            background: "#ffffff"
        })
        .png()
        .toBuffer();

    thumbnailCache.set(url, thumbnail);

    // Keep memory usage bounded.
    if (thumbnailCache.size > MAX_CACHE_ITEMS) {
        const oldest = thumbnailCache.keys().next().value;
        thumbnailCache.delete(oldest);
    }

    return thumbnail;
}

async function renderDeck(deckView) {
    const gameId = deckView.gameId;
    const playerName = deckView.playerName || "Collector";

    const cards = (deckView.cards || []).slice(0, 12);

    const cosmetics = getDeckCosmetics(gameId);

    // The free/default theme is white.
    // Future Monthly Pass themes will be resolved here.
    const backgroundColor = "#ffffff";

    const elements = [];

    // Background
    elements.push(`
        <rect
            width="${WIDTH}"
            height="${HEIGHT}"
            fill="${backgroundColor}"
        />
    `);

    // Header
    elements.push(`
        <rect
            x="30"
            y="24"
            width="1140"
            height="108"
            rx="18"
            fill="#f3f4f8"
        />

        <text
            x="600"
            y="70"
            text-anchor="middle"
            font-size="39"
            font-weight="bold"
            fill="#171b30"
        >NYX CARD VAULT</text>

        <text
            x="600"
            y="105"
            text-anchor="middle"
            font-size="21"
            fill="#555d73"
        >${escapeXml(shorten(playerName, 30))} | ${cards.length}/12 Equipped</text>
    `);

    const overlays = [];

    for (let i = 0; i < 12; i++) {

        const row = Math.floor(i / COLUMNS);
        const col = i % COLUMNS;

        const x = START_X + col * (CARD_WIDTH + GAP);
        const y = START_Y + row * (CARD_HEIGHT + GAP);

        const card = cards[i];

        // Slot background
        elements.push(`
            <rect
                x="${x}"
                y="${y}"
                width="${CARD_WIDTH}"
                height="${CARD_HEIGHT}"
                rx="13"
                fill="#f5f6fa"
                stroke="#d7dbe5"
                stroke-width="2"
            />
        `);

        if (!card) {
            elements.push(`
                <text
                    x="${x + CARD_WIDTH / 2}"
                    y="${y + 157}"
                    text-anchor="middle"
                    font-size="22"
                    fill="#a0a5b4"
                >EMPTY SLOT</text>

                <text
                    x="${x + CARD_WIDTH / 2}"
                    y="${y + 188}"
                    text-anchor="middle"
                    font-size="18"
                    fill="#a0a5b4"
                >#${i + 1}</text>
            `);

            continue;
        }

        const tier = tierLabel(card.tier);

        // Tier label
        elements.push(`
            <text
                x="${x + CARD_WIDTH - 15}"
                y="${y + 29}"
                text-anchor="end"
                font-size="20"
                font-weight="bold"
                fill="#8059b3"
            >${escapeXml(tier)}</text>
        `);

        // Name and series below the artwork
        elements.push(`
            <text
                x="${x + CARD_WIDTH / 2}"
                y="${y + 317}"
                text-anchor="middle"
                font-size="17"
                font-weight="bold"
                fill="#22263b"
            >${escapeXml(shorten(card.name, 22))}</text>
        `);

        // Download and prepare the actual card artwork
        try {
            const thumbnail = await getThumbnail(card);

            if (thumbnail) {
                overlays.push({
                    input: thumbnail,
                    left: x + 5,
                    top: y + 32
                });
            }
        } catch (error) {
            console.warn(
                `[NYX Deck] Could not load ${card.name}:`,
                error.message
            );
        }
    }

    // Footer
    elements.push(`
        <text
            x="600"
            y="1221"
            text-anchor="middle"
            font-size="18"
            fill="#70778c"
        >ACE GAMING UNIVERSE</text>
    `);

    const svg = Buffer.from(`
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="${WIDTH}"
            height="${HEIGHT}"
        >
            ${elements.join("\n")}
        </svg>
    `);

    // Compose the static deck in memory.
    // No temporary files are needed.
    const image = await sharp(svg)
        .composite(overlays)
        .png()
        .toBuffer();

    return {
        type: "image",
        buffer: image,
        cosmetics
    };
}

module.exports = {
    renderDeck
};