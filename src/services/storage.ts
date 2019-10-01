import { StorageManager } from '../lib/file-storage';
import config from '../config';

export const sha256Storage = new StorageManager(config.storage.sha256Root);

sha256Storage.defaultFileName = 'file';
