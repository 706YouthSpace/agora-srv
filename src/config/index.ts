import dev from './dev';
import prod from './prod';

const envMap: any = {
    dev,
    prod
};

export const config = envMap[process.env.NODE_ENV as any] || dev;

export default config;
