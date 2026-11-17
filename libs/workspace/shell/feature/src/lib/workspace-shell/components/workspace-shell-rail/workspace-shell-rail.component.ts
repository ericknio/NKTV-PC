import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { PlaylistsService } from '@iptvnator/services';
import { PlaylistRefreshActionService } from '@iptvnator/playlist/shared/ui';
import {
    PortalRailLink,
    PortalRailSection,
} from '@iptvnator/portal/shared/util';
import {
    type ServerConnectionState,
    ServerStorageStatusService,
} from '@iptvnator/services';
import { WorkspaceShellRailLinksComponent } from '../workspace-shell-rail-links/workspace-shell-rail-links.component';

@Component({
    selector: 'app-workspace-shell-rail',
    imports: [
        MatIcon,
        MatTooltip,
        RouterLink,
        TranslatePipe,
        WorkspaceShellRailLinksComponent,
    ],
    templateUrl: './workspace-shell-rail.component.html',
    styleUrl: './workspace-shell-rail.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceShellRailComponent {
    readonly isMacOS = input(false);
    readonly workspaceLinks = input<PortalRailLink[]>([]);
    readonly primaryContextLinks = input<PortalRailLink[]>([]);
    readonly secondaryContextLinks = input<PortalRailLink[]>([]);
    readonly selectedSection = input<
        PortalRailSection | string | null | undefined
    >(null);
    readonly railProviderClass = input('rail-context-region');
    readonly isSettingsRoute = input(false);

    /** Self-hosted server storage: hidden while `inactive`. */
    readonly serverState = inject(ServerStorageStatusService).state;
    readonly serverIcon = computed(() => SERVER_ICONS[this.serverState()]);
    readonly serverLabelKey = computed(
        () => SERVER_LABEL_KEYS[this.serverState()]
    );

    private readonly router = inject(Router);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly playlistRefreshAction = inject(
        PlaylistRefreshActionService
    );
    readonly isRefreshing = this.playlistRefreshAction.isRefreshing;

    async refreshContent(): Promise<void> {
        try {
            const playlists = await firstValueFrom(
                this.playlistsService.getAllPlaylists()
            );
            const nktv = playlists.find(
                (p) => !!p.serverUrl || p.title === 'NKTV'
            );
            if (nktv) {
                localStorage.setItem(
                    'nktv_last_auto_refresh_timestamp',
                    String(Date.now())
                );
                this.playlistRefreshAction.refresh(nktv);
            }
        } catch (e) {
            console.error('Error refreshing NKTV content:', e);
        }
    }

    async logout(): Promise<void> {
        if (!confirm('Deseja realmente sair da sua conta NKTV?')) {
            return;
        }
        try {
            localStorage.removeItem('nktv_logged_in');
            const playlists = await firstValueFrom(
                this.playlistsService.getAllPlaylists()
            );
            for (const p of playlists) {
                await firstValueFrom(
                    this.playlistsService.deletePlaylist(p._id)
                );
            }
        } catch {
            // ignore
        }
        await this.router.navigate(['/login']);
    }
}

const SERVER_ICONS: Record<ServerConnectionState, string> = {
    inactive: 'dns',
    online: 'dns',
    offline: 'cloud_off',
    unauthorized: 'lock',
};

const SERVER_LABEL_KEYS: Record<ServerConnectionState, string> = {
    inactive: 'SERVER_STORAGE.STATUS_ONLINE',
    online: 'SERVER_STORAGE.STATUS_ONLINE',
    offline: 'SERVER_STORAGE.STATUS_OFFLINE',
    unauthorized: 'SERVER_STORAGE.STATUS_UNAUTHORIZED',
};
