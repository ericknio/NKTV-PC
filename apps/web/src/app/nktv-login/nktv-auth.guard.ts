import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';

export const nktvAuthGuard: CanActivateFn = async () => {
    const playlistsService = inject(PlaylistsService);
    const router = inject(Router);

    try {
        const playlists = await firstValueFrom(playlistsService.getAllPlaylists());
        const hasNktvPlaylist = playlists.some(
            (p) => !!p.serverUrl && !!p.username && !!p.password
        );

        if (!hasNktvPlaylist) {
            return router.parseUrl('/login');
        }

        return true;
    } catch {
        return router.parseUrl('/login');
    }
};

export const nktvLoginGuard: CanActivateFn = async () => {
    const playlistsService = inject(PlaylistsService);
    const router = inject(Router);

    try {
        const playlists = await firstValueFrom(playlistsService.getAllPlaylists());
        const hasNktvPlaylist = playlists.some(
            (p) => !!p.serverUrl && !!p.username && !!p.password
        );

        if (hasNktvPlaylist) {
            return router.parseUrl('/workspace');
        }

        return true;
    } catch {
        return true;
    }
};
