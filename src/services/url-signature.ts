import { SaltedHashManager } from '../lib/hash';
import config from '../config';
import { UrlSignatureManager, AliCDNSignatureManager } from '../lib/url-signature';

export const urlSigningHasher = new SaltedHashManager(config.seed.urlSigningHasher, 'sha1', 'hex');


export const urlSignatureManager = new UrlSignatureManager(urlSigningHasher);
export const aliCDNSignatureManager = new AliCDNSignatureManager(config.aliCDN.authKey);
