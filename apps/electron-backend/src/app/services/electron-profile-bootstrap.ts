import { app } from 'electron';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getElectronUserDataPath } from '@iptvnator/shared/database';
import { activateSourceServerProfile } from './source-server-config';

app.setName('NKTV');
activateSourceServerProfile();

const override = getElectronUserDataPath();
const current = override ?? app.getPath('userData');
if (override) {
    app.setPath('userData', current);
}

// Safely migrate any legacy database if fresh install
try {
    const targetDbDir = join(homedir(), '.nktv', 'databases');
    const targetDb = join(targetDbDir, 'nktv.db');
    const oldDb = join(homedir(), '.iptvnator', 'databases', 'iptvnator.db');

    if (!existsSync(targetDb) && existsSync(oldDb)) {
        if (!existsSync(targetDbDir)) {
            mkdirSync(targetDbDir, { recursive: true });
        }
        copyFileSync(oldDb, targetDb);
    }
} catch {
    // ignore
}
