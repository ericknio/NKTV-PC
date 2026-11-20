import { inject, Injectable, Injector } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { PlaylistRefreshActionService } from '@iptvnator/playlist/shared/ui';
import { AppConfig } from '../../environments/environment';

export const NKTV_DEFAULT_SERVER = 'http://nktv.site';
export const NKTV_SERVER_URL_KEY = 'nktv_server_url';
export const NKTV_DEVICE_ID_KEY = 'nktv_device_id';
export const NKTV_PANEL_PING_URL = 'https://app.fbtec.site/api/v1/ping';
export const NKTV_PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (stays online in panel)

export function getNktvServerUrl(): string {
    try {
        const url = localStorage.getItem(NKTV_SERVER_URL_KEY);
        if (url && url.trim().length > 0) {
            return url.trim().replace(/\/+$/, '');
        }
    } catch {
        // ignore localStorage errors
    }
    return NKTV_DEFAULT_SERVER;
}

export function getNktvDeviceId(): string {
    try {
        let id = localStorage.getItem(NKTV_DEVICE_ID_KEY);
        if (!id) {
            id =
                'pc-' +
                (typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : Math.random().toString(36).substring(2, 10) +
                      Date.now().toString(36));
            localStorage.setItem(NKTV_DEVICE_ID_KEY, id);
        }
        return id;
    } catch {
        return 'pc-unknown';
    }
}

@Injectable({ providedIn: 'root' })
export class NktvPanelSyncService {
    private readonly store = inject(Store);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly injector = inject(Injector);

    private intervalId: ReturnType<typeof setInterval> | null = null;
    private startupTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * Starts background sync and periodic heartbeat with the web panel.
     */
    start(): void {
        if (this.intervalId) {
            return;
        }

        // Delay first ping slightly (3s) to allow app initialization to finish
        this.startupTimeoutId = setTimeout(() => {
            void this.syncWithRemote();
        }, 3000);

        // Periodic heartbeat ping every 5 minutes
        this.intervalId = setInterval(() => {
            void this.syncWithRemote();
        }, NKTV_PING_INTERVAL_MS);
    }

    stop(): void {
        if (this.startupTimeoutId) {
            clearTimeout(this.startupTimeoutId);
            this.startupTimeoutId = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Reports device status to panel and checks for DNS changes.
     * When DNS changes, propagates the new address to saved playlists.
     */
    async syncWithRemote(): Promise<void> {
        try {
            const deviceId = getNktvDeviceId();
            const currentUrl = getNktvServerUrl();
            const osInfo = this.detectOs();

            const payload = {
                device_id: deviceId,
                model: 'Windows PC',
                manufacturer: 'PC Desktop',
                app_version: AppConfig.version,
                android_version: osInfo,
            };

            const response = await fetch(NKTV_PANEL_PING_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                return;
            }

            const data = (await response.json()) as {
                status?: string;
                server_url?: string;
            };

            const remoteUrl = (data.server_url || '').trim().replace(/\/+$/, '');
            if (!remoteUrl) {
                return;
            }

            // Save active DNS to localStorage
            try {
                localStorage.setItem(NKTV_SERVER_URL_KEY, remoteUrl);
            } catch {
                // ignore localStorage errors
            }

            // Check if DNS changed or if existing playlists are on old/default DNS
            if (remoteUrl !== currentUrl) {
                console.log(
                    `[NKTV Sync] Remote DNS changed: ${currentUrl} -> ${remoteUrl}. Propagating...`
                );
                await this.propagateDnsToPlaylists(remoteUrl, currentUrl);
            }
        } catch (err) {
            // Silently ignore ping errors when offline
            console.debug('[NKTV Sync] Heartbeat ping failed:', err);
        }
    }

    private async propagateDnsToPlaylists(
        newUrl: string,
        oldUrl: string
    ): Promise<void> {
        try {
            const playlists = await firstValueFrom(
                this.playlistsService.getAllPlaylists()
            );

            const matchingPlaylists = playlists.filter(
                (p) =>
                    !!p.serverUrl &&
                    (p.serverUrl === oldUrl ||
                        p.serverUrl.includes('nktv.site') ||
                        p.title === 'NKTV')
            );

            for (const playlist of matchingPlaylists) {
                if (playlist.serverUrl === newUrl) {
                    continue;
                }

                console.log(
                    `[NKTV Sync] Updating playlist ${playlist._id} (${playlist.title}) serverUrl to ${newUrl}`
                );

                this.store.dispatch(
                    PlaylistActions.updatePlaylistMeta({
                        playlist: {
                            ...playlist,
                            serverUrl: newUrl,
                        },
                    })
                );

                // Refresh content in background using new server URL
                try {
                    const refreshAction = this.injector.get(
                        PlaylistRefreshActionService
                    );
                    if (!refreshAction.isRefreshing()) {
                        refreshAction.refresh(
                            { ...playlist, serverUrl: newUrl },
                            false
                        );
                    }
                } catch (refreshErr) {
                    console.warn('[NKTV Sync] Auto-refresh on DNS change failed:', refreshErr);
                }
            }
        } catch (err) {
            console.error('[NKTV Sync] Error propagating DNS to playlists:', err);
        }
    }

    private detectOs(): string {
        try {
            const ua = navigator.userAgent;
            if (ua.includes('Windows NT 10.0')) return 'Windows 10/11 (x64)';
            if (ua.includes('Windows NT')) return 'Windows (x64)';
            if (ua.includes('Macintosh')) return 'macOS';
            if (ua.includes('Linux')) return 'Linux';
            return 'Windows';
        } catch {
            return 'Windows';
        }
    }
}
