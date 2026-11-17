/**
 * Channel Name Normalizer and Quality Grouping Engine
 * Ported from Android APK (ChannelNameNormalizer.kt) to TypeScript.
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
    'ᴬ': 'A', 'ᴮ': 'B', 'ᴰ': 'D', 'ᴱ': 'E', 'ᴳ': 'G', 'ᴴ': 'H', 'ᴵ': 'I', 'ᴶ': 'J',
    'ᴷ': 'K', 'ᴸ': 'L', 'ᴹ': 'M', 'ᴺ': 'N', 'ᴼ': 'O', 'ᴾ': 'P', 'ᴿ': 'R', 'ᵀ': 'T',
    'ᵁ': 'U', 'ⱽ': 'V', 'ᵂ': 'W', 'ᔆ': 'S',
    'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f', 'ᵍ': 'g', 'ʰ': 'h',
    'ᶦ': 'i', 'ʲ': 'j', 'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm', 'ⁿ': 'n', 'ᵒ': 'o', 'ᵖ': 'p',
    'ʳ': 'r', 'ˢ': 's', 'ᵗ': 't', 'ᵘ': 'u', 'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
};

const QUALITY_RANKS: Record<string, number> = {
    '8K': 500,
    '4K': 400, 'UHD': 400, 'FUHD': 400, '2160P': 400, '2160': 400,
    'FHD': 300, '1080P': 300, '1080': 300, 'FULLHD': 300, 'FULL HD': 300,
    'HD': 200, '720P': 200, '720': 200,
    'SD': 100, 'LQ': 100, 'HQ': 150, '480P': 100, '480': 100, '576P': 100, '576': 100
};

const EXTRA_TOKENS = new Set([
    'RAW', 'HEVC', 'H265', 'H.265', 'H264', 'H.264', 'AV1',
    '50FPS', '60FPS', '25FPS', '30FPS', 'FPS', 'HDR', 'DOLBY', 'VISION', 'PLUS', 'ALT', 'BKP', 'BACKUP',
    'FONTE', 'OPCAO', 'OPÇÃO', 'SRV', 'SERVER'
]);

const COUNTRY_PREFIX = /^\s*(?:[\[(]([A-Za-z]{2,3})[\])]\s*[|:\-–—]?|([A-Za-z]{2,3})\s*[|:\-–—])\s*/;

export interface NormalizedChannelResult {
    baseName: string;
    groupKey: string;
    qualityRank: number;
    qualityLabel: string;
    region?: string | null;
}

export interface GroupedChannelItem<T = any> {
    baseName: string;
    groupKey: string;
    qualityRank: number;
    qualityLabel: string;
    variants: (T & { qualityRank: number; qualityLabel: string; normalizedBaseName: string })[];
}

function foldSuperscripts(raw: string): string {
    return raw.split('').map((char) => SUPERSCRIPT_MAP[char] || char).join('');
}

export function groupKeyOf(name: string): string {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

export function normalizeChannelName(raw: string): NormalizedChannelResult {
    let working = foldSuperscripts((raw || '').trim());
    let region: string | null = null;

    const match = COUNTRY_PREFIX.exec(working);
    if (match) {
        region = match[1] || match[2] || null;
        working = working.slice(match[0].length);
    }

    // Clean decorations, keeping letters, digits and standard symbols
    working = working.replace(/[^\p{L}\p{Nd} &+.\-/:|()']+/gu, ' ');

    let bestRank = 0;
    const labelParts: string[] = [];
    const keptTokens: string[] = [];

    const rawTokens = working.split(/[\s/]+/).filter(Boolean);
    for (let i = 0; i < rawTokens.length; i++) {
        const token = rawTokens[i];
        const bare = token.replace(/^[.,:;\-|()[\]{}]+|[.,:;\-|()[\]{}]+$/g, '');
        if (!bare) continue;
        const upper = bare.toUpperCase();

        let rank: number | undefined = QUALITY_RANKS[upper];
        let label = upper;

        // Check if token has secondary source suffix, e.g. FHD2, HD2, SD2, 4K2, UHD2
        const sourceMatch = /^([A-Z0-9]+?)([2-9])$/.exec(upper);
        if (rank == null && sourceMatch) {
            const baseQuality = sourceMatch[1];
            const sourceNum = parseInt(sourceMatch[2], 10);
            if (QUALITY_RANKS[baseQuality] != null) {
                rank = QUALITY_RANKS[baseQuality] - (sourceNum - 1) * 10;
                label = baseQuality + sourceNum;
            }
        }

        // Check if next token is a standalone source digit, e.g. 'FHD' followed by '2'
        if (rank != null && !sourceMatch && i + 1 < rawTokens.length) {
            const nextBare = rawTokens[i + 1].replace(/^[.,:;\-|()[\]{}]+|[.,:;\-|()[\]{}]+$/g, '');
            if (/^[2-9]$/.test(nextBare)) {
                const sourceNum = parseInt(nextBare, 10);
                rank = rank - (sourceNum - 1) * 10;
                label = label + sourceNum;
                i++; // consume next token
            }
        }

        if (rank != null) {
            if (rank > bestRank || bestRank === 0) bestRank = rank;
            labelParts.push(label);
        } else if (EXTRA_TOKENS.has(upper)) {
            // Also check if next token is a number for EXTRA_TOKENS like 'FONTE 2'
            if (i + 1 < rawTokens.length) {
                const nextBare = rawTokens[i + 1].replace(/^[.,:;\-|()[\]{}]+|[.,:;\-|()[\]{}]+$/g, '');
                if (/^[2-9]$/.test(nextBare)) {
                    i++; // consume next token
                }
            }
            labelParts.push(bare);
        } else {
            keptTokens.push(bare);
        }
    }

    const base = keptTokens.join(' ').replace(/\s+/g, ' ').trim();
    const key = groupKeyOf(base);

    return {
        baseName: base || raw.trim(),
        groupKey: key || groupKeyOf(raw),
        qualityRank: bestRank,
        qualityLabel: labelParts.join(' '),
        region,
    };
}

/**
 * Groups a flat array of channels into consolidated channel items by base name.
 * Each channel item holds all its resolution variants sorted from highest to lowest quality.
 */
export function groupChannelsByQuality<
    T extends {
        title?: string;
        name?: string;
        xtream_id: number;
        epg_channel_id?: string | null;
        stream_icon?: string;
        poster_url?: string;
        tv_archive?: number | null;
    }
>(channels: readonly T[]): T[] {
    if (!channels || channels.length === 0) {
        return [];
    }

    const groupsMap = new Map<string, (T & { qualityRank: number; qualityLabel: string; normalizedBaseName: string })[]>();
    const order: string[] = [];

    for (const channel of channels) {
        const rawName = channel.title || channel.name || '';
        const norm = normalizeChannelName(rawName);
        const key = norm.groupKey || `id_${channel.xtream_id}`;

        const variant = {
            ...channel,
            qualityRank: norm.qualityRank,
            qualityLabel: norm.qualityLabel || (norm.qualityRank > 0 ? '' : 'Padrão'),
            normalizedBaseName: norm.baseName,
        };

        const existing = groupsMap.get(key);
        if (!existing) {
            groupsMap.set(key, [variant]);
            order.push(key);
        } else {
            existing.push(variant);
        }
    }

    return order.map((key) => {
        const variants = groupsMap.get(key)!;
        // Sort highest quality first (4K > FHD > HD > SD)
        variants.sort((a, b) => b.qualityRank - a.qualityRank);

        // If multiple variants have identical qualityLabel, disambiguate with (2), (3)...
        const seenLabels = new Map<string, number>();
        variants.forEach((v) => {
            const label = v.qualityLabel || 'Padrão';
            const count = (seenLabels.get(label) || 0) + 1;
            seenLabels.set(label, count);
            if (count > 1) {
                v.qualityLabel = `${label} (${count})`;
            }
        });

        const best = variants[0];

        // Inherit EPG ID, icon, or archive from any variant that has it
        const epgChannelId =
            variants.find((v) => !!v.epg_channel_id)?.epg_channel_id || best.epg_channel_id;
        const icon =
            variants.find((v) => !!(v.stream_icon || v.poster_url))?.stream_icon || best.stream_icon;
        const hasArchive = variants.some((v) => Boolean(v.tv_archive));

        return {
            ...best,
            title: best.normalizedBaseName,
            name: best.normalizedBaseName,
            epg_channel_id: epgChannelId,
            stream_icon: icon,
            tv_archive: hasArchive ? (best.tv_archive || 1) : 0,
            variants,
        } as T;
    });
}
