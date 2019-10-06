import { SaltedHashManager } from '../lib/hash';
import config from '../config';
import { UrlSignatureManager } from '../lib/url-signature';

export const urlSigningHasher = new SaltedHashManager(config.seed.urlSigningHasher, 'sha1', 'hex');


export const urlSignatureManager = new UrlSignatureManager(urlSigningHasher);
