import { EnvConfig } from '../lib/config';

export const config = new EnvConfig(__dirname, 'dev').load();

export default config;
