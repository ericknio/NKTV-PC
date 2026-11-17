import { inject, Injectable, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';

export const NKTV_LAST_REFRESH_KEY = 'nktv_last_auto_refresh_timestamp';
export const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms (259,200,000 ms)

@Injectable({ providedIn: 'root' })
export class NktvAutoRefreshService {
    private readonly playlistsService = inject(PlaylistsService);
    private readonly injector = inject(Injector);

    private intervalId: ReturnType<typeof setInterval> | null = null;
    private startupTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * Starts the automatic 3-day content refresh watcher.
     */
    start(): void {
        if (this.intervalId) {
            return;
        }

        // Delay initial check by 10 seconds so app startup and views complete loading
        this.startupTimeoutId = setTimeout(() => {
            void this.checkAndRefresh();
        }, 10000);

        // Recurring check every hour
        this.intervalId = setInterval(
            () => {
                void this.checkAndRefresh();
            },
            60 * 60 * 1000
        );
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

    async checkAndRefresh(): Promise<void> {
        try {
            const lastRefreshStr = localStorage.getItem(NKTV_LAST_REFRESH_KEY);
            const now = Date.now();

            if (!lastRefreshStr) {
                // First launch with a playlist: initialize the timestamp so 3 days count from now
                const playlists = await firstValueFrom(
                    this.playlistsService.getAllPlaylists()
                );
                const nktv = playlists.find(
                    (p) => !!p.serverUrl || p.title === 'NKTV'
                );
                if (nktv) {
                    localStorage.setItem(NKTV_LAST_REFRESH_KEY, String(now));
                }
                return;
            }

            const lastRefresh = Number(lastRefreshStr);
            if (isNaN(lastRefresh) || now - lastRefresh >= THREE_DAYS_MS) {
                const playlists = await firstValueFrom(
                    this.playlistsService.getAllPlaylists()
                );
                const nktv = playlists.find(
                    (p) => !!p.serverUrl || p.title === 'NKTV'
                );

                if (nktv) {
                    const { PlaylistRefreshActionService } = await import(
                        '@iptvnator/playlist/shared/ui'
                    );
                    const refreshAction = this.injector.get(
                        PlaylistRefreshActionService
                    );

                    if (!refreshAction.isRefreshing()) {
                        console.log(
                            '[NKTV] Auto-refresh triggered: 3 days elapsed since last content update.'
                        );
                        localStorage.setItem(NKTV_LAST_REFRESH_KEY, String(now));
                        // Refresh directly without blocking modal dialog
                        refreshAction.refresh(nktv, false);
                    }
                }
            }
        } catch (err) {
            console.error('[NKTV] Error checking 3-day auto refresh:', err);
        }
    }

    markRefreshed(): void {
        localStorage.setItem(NKTV_LAST_REFRESH_KEY, String(Date.now()));
    }
}
