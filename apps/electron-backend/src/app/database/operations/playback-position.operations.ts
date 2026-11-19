import { and, desc, eq, sql } from 'drizzle-orm';
import * as schema from '@iptvnator/shared/database/schema';
import type { AppDatabase } from '../database.types';

type PlaylistType = 'xtream' | 'stalker' | 'm3u-file' | 'm3u-text' | 'm3u-url';

type PlaybackPositionPayload = {
    contentXtreamId: number;
    contentType: 'vod' | 'episode';
    seriesXtreamId?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    positionSeconds: number;
    durationSeconds?: number;
    playlistType?: PlaylistType;
};

async function ensurePlaylistExists(
    db: AppDatabase,
    playlistId: string,
    playlistType: PlaylistType = 'stalker'
): Promise<void> {
    const existing = await db
        .select()
        .from(schema.playlists)
        .where(eq(schema.playlists.id, playlistId))
        .limit(1);

    if (existing.length === 0) {
        await db.insert(schema.playlists).values({
            id: playlistId,
            name: 'Imported Playlist',
            type: playlistType,
        });
    }
}

export async function savePlaybackPosition(
    db: AppDatabase,
    playlistId: string,
    data: PlaybackPositionPayload
): Promise<{ success: boolean }> {
    await ensurePlaylistExists(db, playlistId, data.playlistType);

    const values = {
        playlistId,
        contentXtreamId: data.contentXtreamId,
        contentType: data.contentType,
        seriesXtreamId: data.seriesXtreamId,
        seasonNumber: data.seasonNumber,
        episodeNumber: data.episodeNumber,
        positionSeconds: data.positionSeconds,
        durationSeconds: data.durationSeconds,
        updatedAt: sql`CURRENT_TIMESTAMP`,
    };

    const existing = await db
        .select()
        .from(schema.playbackPositions)
        .where(
            and(
                eq(schema.playbackPositions.playlistId, playlistId),
                eq(
                    schema.playbackPositions.contentXtreamId,
                    data.contentXtreamId
                ),
                eq(schema.playbackPositions.contentType, data.contentType)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        await db
            .update(schema.playbackPositions)
            .set(values)
            .where(eq(schema.playbackPositions.id, existing[0].id));
    } else {
        await db.insert(schema.playbackPositions).values(values);
    }

    if (data.positionSeconds > 0 && typeof (db as any).run === 'function') {
        try {
            if (data.contentType === 'vod') {
                (db as any).run(sql`
                    INSERT INTO recently_viewed (content_id, playlist_id, viewed_at)
                    SELECT c.id, ${playlistId}, CURRENT_TIMESTAMP
                    FROM content c
                    JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                    WHERE c.xtream_id = ${data.contentXtreamId} AND c.type = 'vod'
                    ON CONFLICT(content_id, playlist_id) DO UPDATE SET
                    viewed_at = CURRENT_TIMESTAMP;
                `);
            } else if (data.contentType === 'episode' && data.seriesXtreamId) {
                (db as any).run(sql`
                    INSERT INTO recently_viewed (content_id, playlist_id, viewed_at)
                    SELECT c.id, ${playlistId}, CURRENT_TIMESTAMP
                    FROM content c
                    JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                    WHERE c.xtream_id = ${data.seriesXtreamId} AND c.type = 'series'
                    ON CONFLICT(content_id, playlist_id) DO UPDATE SET
                    viewed_at = CURRENT_TIMESTAMP;
                `);
            }
        } catch {
            // ignore
        }
    }

    return { success: true };
}

export async function savePlaybackPositionsBatch(
    db: AppDatabase,
    playlistId: string,
    items: PlaybackPositionPayload[]
): Promise<{ success: boolean; count: number }> {
    if (!Array.isArray(items) || items.length === 0) {
        return { success: true, count: 0 };
    }

    // ensurePlaylistExists awaits, so it must run before the synchronous
    // transaction callback below.
    await ensurePlaylistExists(db, playlistId, items[0]?.playlistType);

    await db.transaction(() => {
        for (const item of items) {
            // .run() (synchronous), NOT .execute(): the better-sqlite3
            // driver's .execute() defers the write to a resolved promise
            // that never settles inside this synchronous transaction
            // callback, so the upsert would silently do nothing. See the
            // matching note in recently-viewed.operations.ts (issue #1137).
            db.insert(schema.playbackPositions)
                .values({
                    playlistId,
                    contentXtreamId: item.contentXtreamId,
                    contentType: item.contentType,
                    seriesXtreamId: item.seriesXtreamId,
                    seasonNumber: item.seasonNumber,
                    episodeNumber: item.episodeNumber,
                    positionSeconds: item.positionSeconds,
                    durationSeconds: item.durationSeconds,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .onConflictDoUpdate({
                    target: [
                        schema.playbackPositions.contentXtreamId,
                        schema.playbackPositions.playlistId,
                        schema.playbackPositions.contentType,
                    ],
                    set: {
                        seriesXtreamId: item.seriesXtreamId,
                        seasonNumber: item.seasonNumber,
                        episodeNumber: item.episodeNumber,
                        positionSeconds: item.positionSeconds,
                        durationSeconds: item.durationSeconds,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                })
                .run();
        }

        if (typeof (db as any).run === 'function') {
            try {
                for (const item of items) {
                    if (item.positionSeconds > 0) {
                        if (item.contentType === 'vod') {
                            (db as any).run(sql`
                                INSERT INTO recently_viewed (content_id, playlist_id, viewed_at)
                                SELECT c.id, ${playlistId}, CURRENT_TIMESTAMP
                                FROM content c
                                JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                                WHERE c.xtream_id = ${item.contentXtreamId} AND c.type = 'vod'
                                ON CONFLICT(content_id, playlist_id) DO UPDATE SET
                                viewed_at = CURRENT_TIMESTAMP;
                            `);
                        } else if (item.contentType === 'episode' && item.seriesXtreamId) {
                            (db as any).run(sql`
                                INSERT INTO recently_viewed (content_id, playlist_id, viewed_at)
                                SELECT c.id, ${playlistId}, CURRENT_TIMESTAMP
                                FROM content c
                                JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                                WHERE c.xtream_id = ${item.seriesXtreamId} AND c.type = 'series'
                                ON CONFLICT(content_id, playlist_id) DO UPDATE SET
                                viewed_at = CURRENT_TIMESTAMP;
                            `);
                        }
                    }
                }
            } catch {
                // ignore
            }
        }
    });

    return { success: true, count: items.length };
}

export async function clearPlaybackPositionsBatch(
    db: AppDatabase,
    playlistId: string,
    items: { contentXtreamId: number; contentType: 'vod' | 'episode' }[]
): Promise<{ success: boolean; count: number }> {
    if (!Array.isArray(items) || items.length === 0) {
        return { success: true, count: 0 };
    }

    if (typeof (db as any).run === 'function') {
        try {
            for (const { contentXtreamId, contentType } of items) {
                if (contentType === 'vod') {
                    (db as any).run(sql`
                        DELETE FROM recently_viewed
                        WHERE playlist_id = ${playlistId}
                        AND content_id IN (
                            SELECT c.id FROM content c
                            JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                            WHERE c.xtream_id = ${contentXtreamId} AND c.type = 'vod'
                        );
                    `);
                } else if (contentType === 'episode') {
                    (db as any).run(sql`
                        DELETE FROM recently_viewed
                        WHERE playlist_id = ${playlistId}
                        AND content_id IN (
                            SELECT c.id FROM content c
                            JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                            WHERE c.type = 'series' AND c.xtream_id IN (
                                SELECT p1.series_xtream_id FROM playback_positions p1
                                WHERE p1.playlist_id = ${playlistId} AND p1.content_xtream_id = ${contentXtreamId} AND p1.content_type = 'episode'
                                AND NOT EXISTS (
                                    SELECT 1 FROM playback_positions p2
                                    WHERE p2.playlist_id = ${playlistId}
                                    AND p2.series_xtream_id = p1.series_xtream_id
                                    AND p2.content_xtream_id != p1.content_xtream_id
                                    AND p2.content_type = 'episode'
                                    AND p2.position_seconds > 0
                                )
                            )
                        );
                    `);
                }
            }
        } catch {
            // ignore
        }
    }

    const stmt = db
        .delete(schema.playbackPositions)
        .where(
            and(
                eq(schema.playbackPositions.playlistId, playlistId),
                eq(
                    schema.playbackPositions.contentXtreamId,
                    sql.placeholder('contentXtreamId')
                ),
                eq(
                    schema.playbackPositions.contentType,
                    sql.placeholder('contentType')
                )
            )
        )
        .prepare();

    await db.transaction(() => {
        for (const { contentXtreamId, contentType } of items) {
            // .run(), not .execute() — see savePlaybackPositionsBatch.
            stmt.run({ contentXtreamId, contentType });
        }
    });

    return { success: true, count: items.length };
}

export async function getPlaybackPosition(
    db: AppDatabase,
    playlistId: string,
    contentXtreamId: number,
    contentType: 'vod' | 'episode'
) {
    const result = await db
        .select()
        .from(schema.playbackPositions)
        .where(
            and(
                eq(schema.playbackPositions.playlistId, playlistId),
                eq(schema.playbackPositions.contentXtreamId, contentXtreamId),
                eq(schema.playbackPositions.contentType, contentType)
            )
        )
        .limit(1);

    return result[0] || null;
}

export async function getSeriesPlaybackPositions(
    db: AppDatabase,
    playlistId: string,
    seriesXtreamId: number
) {
    return db
        .select()
        .from(schema.playbackPositions)
        .where(
            and(
                eq(schema.playbackPositions.playlistId, playlistId),
                eq(schema.playbackPositions.seriesXtreamId, seriesXtreamId),
                eq(schema.playbackPositions.contentType, 'episode')
            )
        );
}

export async function getRecentPlaybackPositions(
    db: AppDatabase,
    playlistId: string,
    limit = 20
) {
    return db
        .select()
        .from(schema.playbackPositions)
        .where(eq(schema.playbackPositions.playlistId, playlistId))
        .orderBy(desc(schema.playbackPositions.updatedAt))
        .limit(limit);
}

export async function getAllPlaybackPositions(
    db: AppDatabase,
    playlistId: string
) {
    return db
        .select()
        .from(schema.playbackPositions)
        .where(eq(schema.playbackPositions.playlistId, playlistId));
}

/** Backup replacement must never commit deletion without all restored rows. */
export async function replaceAllPlaybackPositions(
    db: AppDatabase,
    playlistId: string,
    items: PlaybackPositionPayload[]
): Promise<{ success: boolean }> {
    db.transaction((tx) => {
        tx.delete(schema.playbackPositions)
            .where(eq(schema.playbackPositions.playlistId, playlistId))
            .run();
        for (const item of items) {
            const values = {
                playlistId,
                contentXtreamId: item.contentXtreamId,
                contentType: item.contentType,
                seriesXtreamId: item.seriesXtreamId,
                seasonNumber: item.seasonNumber,
                episodeNumber: item.episodeNumber,
                positionSeconds: item.positionSeconds,
                durationSeconds: item.durationSeconds,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            };
            // Match the former save loop: later duplicate values win, while
            // omitted optional fields retain the earlier snapshot's metadata.
            tx.insert(schema.playbackPositions)
                .values(values)
                .onConflictDoUpdate({
                    target: [
                        schema.playbackPositions.contentXtreamId,
                        schema.playbackPositions.playlistId,
                        schema.playbackPositions.contentType,
                    ],
                    set: values,
                })
                .run();
        }
    });
    return { success: true };
}

export async function clearAllPlaybackPositions(
    db: AppDatabase,
    playlistId: string
): Promise<{ success: boolean }> {
    await db
        .delete(schema.playbackPositions)
        .where(eq(schema.playbackPositions.playlistId, playlistId));

    return { success: true };
}

export async function clearPlaybackPosition(
    db: AppDatabase,
    playlistId: string,
    contentXtreamId: number,
    contentType: 'vod' | 'episode'
): Promise<{ success: boolean }> {
    if (typeof (db as any).run === 'function') {
        try {
            if (contentType === 'vod') {
                (db as any).run(sql`
                    DELETE FROM recently_viewed
                    WHERE playlist_id = ${playlistId}
                    AND content_id IN (
                        SELECT c.id FROM content c
                        JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                        WHERE c.xtream_id = ${contentXtreamId} AND c.type = 'vod'
                    );
                `);
            } else if (contentType === 'episode') {
                (db as any).run(sql`
                    DELETE FROM recently_viewed
                    WHERE playlist_id = ${playlistId}
                    AND content_id IN (
                        SELECT c.id FROM content c
                        JOIN categories cat ON c.category_id = cat.id AND cat.playlist_id = ${playlistId}
                        WHERE c.type = 'series' AND c.xtream_id IN (
                            SELECT p1.series_xtream_id FROM playback_positions p1
                            WHERE p1.playlist_id = ${playlistId} AND p1.content_xtream_id = ${contentXtreamId} AND p1.content_type = 'episode'
                            AND NOT EXISTS (
                                SELECT 1 FROM playback_positions p2
                                WHERE p2.playlist_id = ${playlistId}
                                AND p2.series_xtream_id = p1.series_xtream_id
                                AND p2.content_xtream_id != p1.content_xtream_id
                                AND p2.content_type = 'episode'
                                AND p2.position_seconds > 0
                            )
                        )
                    );
                `);
            }
        } catch {
            // ignore
        }
    }

    await db
        .delete(schema.playbackPositions)
        .where(
            and(
                eq(schema.playbackPositions.playlistId, playlistId),
                eq(schema.playbackPositions.contentXtreamId, contentXtreamId),
                eq(schema.playbackPositions.contentType, contentType)
            )
        );

    return { success: true };
}
