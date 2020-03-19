import { TemporaryFileManger } from '../lib/tmp-file';
import config from '../config';

export const tmpFileManager = new TemporaryFileManger(config.tmpDir);
