import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';
import { normalizeDateLocale } from '@iptvnator/pipes';
import { SourceStatusService } from '@iptvnator/portal/shared/data-access';
import {
    PlaylistContextFacade,
    sourceDisplayName,
    sourceMetaParts,
} from '@iptvnator/playlist/shared/util';
import { injectTranslationTick } from '@iptvnator/services';
import { PlaylistMeta } from '@iptvnator/shared/interfaces';
import { SourceTileComponent } from '../source-row/source-tile.component';

@Component({
    selector: 'app-playlist-switcher',
    imports: [
        MatIcon,
        SourceTileComponent,
    ],
    templateUrl: './playlist-switcher.component.html',
    styleUrls: ['./playlist-switcher.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistSwitcherComponent {
    private readonly playlistContext = inject(PlaylistContextFacade);
    private readonly statusService = inject(SourceStatusService);
    private readonly translate = inject(TranslateService);
    private readonly languageTick = injectTranslationTick();
    private readonly trigger =
        viewChild.required<ElementRef<HTMLElement>>('trigger');

    readonly currentTitle = input.required<string>();
    readonly subtitle = input<string>('');
    readonly playlistSelected = output<string>();
    readonly accountInfoForPlaylistRequested = output<PlaylistMeta>();
    readonly addPlaylistRequested = output<void>();

    readonly isOpen = signal(false);
    readonly activePlaylistId = this.playlistContext.resolvedPlaylistId;
    readonly activePlaylist = this.playlistContext.activePlaylist;

    readonly displayTitle = computed(() => {
        this.languageTick();
        if (!this.activePlaylistId()) {
            return this.translate.instant('HOME.PLAYLISTS.SELECT_PLAYLIST');
        }
        const active = this.activePlaylist();
        return (
            (active ? sourceDisplayName(active) : this.currentTitle()) ||
            this.translate.instant('HOME.PLAYLISTS.UNTITLED_PLAYLIST')
        );
    });

    readonly triggerSubtitle = computed(() => {
        this.languageTick();
        const active = this.activePlaylist();
        if (!active) {
            return this.subtitle();
        }
        return sourceMetaParts(
            active,
            {
                translate: (key, params) => this.translate.instant(key, params),
                locale: normalizeDateLocale(this.translate.currentLang),
                now: Date.now(),
            },
            true
        )
            .filter((part) => part.kind === 'type' || part.kind === 'channels')
            .map((part) => part.text)
            .join(' · ');
    });
    readonly activeStatus = computed(() => {
        const active = this.activePlaylist();
        return active ? this.statusService.statusOf(active) : null;
    });

    toggle(): void {}
    open(): void {}
    close(): void {}
}
