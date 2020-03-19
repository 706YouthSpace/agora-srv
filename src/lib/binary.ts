import { randomBytes as crandom } from 'crypto';

export async function randomBytes(size: number = 1) {
    return new Promise<Buffer>((resolve, reject) => {
        crandom(size, (err, buf) => {
            if (err) {
                return reject(err);
            }

            return resolve(buf);
        });
    });

}

export function encodeBase64UrlSafe(buff: Buffer) {
    return buff.toString('base64')
        .replace(/\+/g, '-') // Convert '+' to '-'
        .replace(/\//g, '_') // Convert '/' to '_'
        .replace(/=+$/, ''); // Remove ending '=';
}

const PADD_FACTOR1 = 5;
const PADD_FACTOR2 = 4;

export function decodeBase64UrlSafe(b64Str: string) {
    const padded = b64Str + Array(PADD_FACTOR1 - b64Str.length % PADD_FACTOR2).join('=');
    const original = padded
        .replace(/\-/g, '+') // Convert '-' to '+'
        .replace(/\_/g, '/'); // Convert '_' to '/'

    return Buffer.from(original, 'base64');
}
