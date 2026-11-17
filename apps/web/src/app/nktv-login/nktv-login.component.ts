import {
    ChangeDetectionStrategy,
    Component,
    inject,
    signal,
    OnInit,
} from '@angular/core';
import {
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { PlaylistActions } from '@iptvnator/m3u-state';
import {
    PlaylistsService,
    XtreamConnectionTestService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import {
    createRandomId,
    Playlist,
    XTREAM_CONTENT_TYPES,
} from '@iptvnator/shared/interfaces';
import { PasswordVisibilityToggleDirective } from '@iptvnator/ui/components/password-visibility-toggle';
import { getNktvServerUrl } from '../services/nktv-panel-sync.service';

export const NKTV_FIXED_SERVER = 'http://nktv.site';

@Component({
    selector: 'app-nktv-login',
    standalone: true,
    imports: [
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        PasswordVisibilityToggleDirective,
    ],
    templateUrl: './nktv-login.component.html',
    styleUrls: ['./nktv-login.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NktvLoginComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly store = inject(Store);
    private readonly playlistsService = inject(PlaylistsService);
    private readonly xtreamTest = inject(XtreamConnectionTestService);
    readonly runtime = inject(RuntimeCapabilitiesService);

    readonly loading = signal(false);
    readonly errorMessage = signal<string | null>(null);
    readonly showForceLogin = signal(false);

    readonly loginForm = new FormGroup({
        username: new FormControl('', [Validators.required]),
        password: new FormControl('', [Validators.required]),
    });

    async ngOnInit(): Promise<void> {
        try {
            const savedUser = localStorage.getItem('nktv_saved_username');
            const savedPwEnc = localStorage.getItem('nktv_saved_password');
            if (savedUser) {
                this.loginForm.controls.username.setValue(savedUser);
            }
            if (savedPwEnc) {
                try {
                    const savedPw = decodeURIComponent(atob(savedPwEnc));
                    this.loginForm.controls.password.setValue(savedPw);
                    if (savedUser && savedPw) {
                        setTimeout(() => {
                            if (!this.loading()) {
                                void this.onSubmit();
                            }
                        }, 50);
                    }
                } catch {
                    // ignore base64 decode error
                }
            }
        } catch {
            // ignore localStorage errors
        }
    }

    async onSubmit(): Promise<void> {
        if (this.loginForm.invalid || this.loading()) {
            return;
        }

        const username = this.loginForm.controls.username.value?.trim() || '';
        const password = this.loginForm.controls.password.value?.trim() || '';

        if (!username || !password) {
            this.errorMessage.set('Por favor, preencha o usuário e a senha.');
            return;
        }

        this.loading.set(true);
        this.errorMessage.set(null);
        this.showForceLogin.set(false);

        const activeServer = getNktvServerUrl();

        try {
            const testResult = await this.xtreamTest.test({
                serverUrl: activeServer,
                username,
                password,
            });

            if (testResult.status === 'active') {
                await this.completeLogin(username, password);
            } else if (testResult.status === 'inactive') {
                this.errorMessage.set('Usuário ou senha incorretos.');
            } else if (testResult.status === 'expired') {
                this.errorMessage.set('Sua assinatura NKTV expirou. Entre em contato com o suporte.');
            } else {
                // Server unavailable or timeout
                this.errorMessage.set('Não foi possível conectar ao servidor NKTV. Verifique sua conexão com a internet.');
                this.showForceLogin.set(true);
            }
        } catch (error) {
            console.error('NKTV login error:', error);
            this.errorMessage.set('Erro ao conectar ao servidor. Verifique sua conexão.');
            this.showForceLogin.set(true);
        } finally {
            this.loading.set(false);
        }
    }

    async forceLogin(): Promise<void> {
        const username = this.loginForm.controls.username.value?.trim() || '';
        const password = this.loginForm.controls.password.value?.trim() || '';
        if (username && password) {
            this.loading.set(true);
            try {
                await this.completeLogin(username, password);
            } finally {
                this.loading.set(false);
            }
        }
    }

    private async completeLogin(username: string, password: string): Promise<void> {
        try {
            localStorage.setItem('nktv_saved_username', username);
            localStorage.setItem('nktv_saved_password', btoa(encodeURIComponent(password)));
            localStorage.setItem('nktv_logged_in', 'true');
            localStorage.setItem(
                'nktv_last_auto_refresh_timestamp',
                String(Date.now())
            );
        } catch {
            // ignore localStorage errors
        }

        const activeServer = getNktvServerUrl();
        // Get existing playlists to update or replace
        const allPlaylists = await firstValueFrom(this.playlistsService.getAllPlaylists());
        const existingNktv = allPlaylists.find(
            (p) =>
                p.serverUrl?.includes('nktv.site') ||
                p.serverUrl === activeServer ||
                p.title === 'NKTV'
        );

        const playlistId = existingNktv?._id ?? createRandomId();
        const playlist = {
            ...(existingNktv ?? {}),
            _id: playlistId,
            title: 'NKTV',
            serverUrl: activeServer,
            username,
            password,
            importDate: new Date().toISOString(),
            xtreamContentTypes: [...XTREAM_CONTENT_TYPES],
        } as Playlist;

        this.store.dispatch(PlaylistActions.addPlaylist({ playlist }));

        // Navigate directly to the Xtream live channels view
        await this.router.navigate(['/workspace', 'xtreams', playlistId, 'live']);
    }
}
