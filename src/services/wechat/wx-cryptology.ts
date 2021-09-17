import {
    createCipheriv, createDecipheriv,
    randomFillSync, createHash,
    createSign, KeyObject,
    constants as cryptoConstants,
    publicEncrypt, privateDecrypt, createVerify
} from 'crypto';

const RSA_PKCS1_OAEP_PADDING = cryptoConstants.RSA_PKCS1_OAEP_PADDING;

const WECHAT_MINIPROGRAM_CRYPTOLOGY_ALGORITHM = 'aes-128-cbc';
const WECHAT_OPENPLATFORM_CRYPTOLOGY_ALGORITHM = 'aes-256-cbc';

// Very strange behavior for the WeChat OpenPlatform to use a 256b padding size.
// Because AES block size is always 128b.
// 256b padding is just a waste of bits.
const WECHAT_OPENPLATFORM_PKCS7_PADDING_BLOCK_SIZE_IN_BYTES = 32;

function paddPKCS7(buff: Buffer, k: number = 16) {
    const bytesToPad = k - (buff.byteLength % k);
    const paddBuff = Buffer.allocUnsafe(bytesToPad);
    paddBuff.fill(bytesToPad);

    return Buffer.concat([buff, paddBuff]);
}

function unpaddPKCS7(buff: Buffer) {
    const lastByte = buff[buff.byteLength - 1];
    if (!lastByte || buff.byteLength < lastByte) {
        throw new RangeError('Insufficient bytes to perform pkcs7 unpadd');
    }

    const unpaddedBuf = buff.slice(0, buff.byteLength - lastByte);

    return unpaddedBuf;
}


export function wxMiniProgramDecryptBuffer(buff: Buffer, key: Buffer, iv: Buffer) {
    const cipher = createDecipheriv(WECHAT_MINIPROGRAM_CRYPTOLOGY_ALGORITHM, key, iv);
    cipher.setAutoPadding(true);
    const r = cipher.update(buff);

    return Buffer.concat([r, cipher.final()]);
}

export function wxMiniProgramEncryptBuffer(buff: Buffer, key: Buffer, iv: Buffer) {
    const cipher = createCipheriv(WECHAT_MINIPROGRAM_CRYPTOLOGY_ALGORITHM, key, iv);
    cipher.setAutoPadding(true);

    const r = cipher.update(buff);

    return Buffer.concat([r, cipher.final()]);
}

export function wxOpenPlatformDecryptBuffer(buff: Buffer, key: Buffer, iv: Buffer) {
    const cipher = createDecipheriv(WECHAT_OPENPLATFORM_CRYPTOLOGY_ALGORITHM, key, iv);
    cipher.setAutoPadding(false);
    const r = cipher.update(buff);

    return unpaddPKCS7(Buffer.concat([r, cipher.final()]));
}

export function wxOpenPlatformEncryptBuffer(buff: Buffer, key: Buffer, iv: Buffer) {
    const cipher = createCipheriv(WECHAT_OPENPLATFORM_CRYPTOLOGY_ALGORITHM, key, iv);
    cipher.setAutoPadding(false);

    const r = cipher.update(paddPKCS7(buff, WECHAT_OPENPLATFORM_PKCS7_PADDING_BLOCK_SIZE_IN_BYTES));

    return Buffer.concat([r, cipher.final()]);
}

export function wxMiniProgramDecryptB64(data: string, key: string, iv: string) {
    const dataBuff = Buffer.from(data, 'base64');
    const keyBuff = Buffer.from(key, 'base64');
    const ivBuff = Buffer.from(iv, 'base64');

    const decryptedBuff = wxMiniProgramDecryptBuffer(dataBuff, keyBuff, ivBuff);

    const decryptedString = decryptedBuff.toString('utf8');

    return JSON.parse(decryptedString);
}


const WX_OPENPLATFORM_IV_SIZE = 16;
const WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET = 16;
const WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_EXPRESS_LENGTH = 4;

/**
 * @function wxOpenPlatformDecryptB64
 *
 * Really painful message format used by the open platform.
 * Wanted to hit the wx developer in the face.
 *
 * Doc: https://open.weixin.qq.com/cgi-bin/showdocument?action=dir_list&t=resource/res_list&verify=1&id=open1419318482&lang=zh_CN
 * Sample code: https://wximg.gtimg.com/shake_tv/mpwiki/cryptoDemo.zip
 * But the doc is not helpful at all.
 * Reading the example code is a must to figure out wtf is happening.
 *
 * Pitfalls:
 * 1. AES iv is the first 16B/128b of encryption key in binary.
 * 2. Format: [[RandomBytes_16][UIntBE_4: binary length of body][UTF8: Body][UTF8: AppId]] .
 * Which is NOT mentioned in the doc.
 *
 * @export
 * @param {string} data
 * @param {string} key
 * @returns {[string, string]} [Decrypted string, appid]
 */
export function wxOpenPlatformDecryptB64(data: string, key: string): [string, string] {
    const dataBuff = Buffer.from(data, 'base64');
    const keyBuff = Buffer.from(`${key}=`, 'base64');
    const ivBuff = keyBuff.slice(0, WX_OPENPLATFORM_IV_SIZE);

    const decryptedBuff = wxOpenPlatformDecryptBuffer(dataBuff, keyBuff, ivBuff);

    const contentLength = decryptedBuff.readUInt32BE(WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET);

    const msgStartPos = WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET +
        WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_EXPRESS_LENGTH;

    const msgEndPos = msgStartPos + contentLength;

    const theRealContent = decryptedBuff.slice(msgStartPos, msgEndPos);
    const appIdBuff = decryptedBuff.slice(msgEndPos);

    const decryptedString = theRealContent.toString('utf8');
    const decryptedAppId = appIdBuff.toString('utf8');

    return [decryptedString, decryptedAppId];
}

export function wxOpenPlatformEncryptB64(data: string, key: string, appId: string) {
    const dataBuff = Buffer.from(data, 'utf8');
    const appIdBuff = Buffer.from(appId, 'utf8');
    const keyBuff = Buffer.from(`${key}=`, 'base64');
    const ivBuff = keyBuff.slice(0, WX_OPENPLATFORM_IV_SIZE);

    const totalSize = appIdBuff.byteLength + dataBuff.byteLength +
        WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_EXPRESS_LENGTH +
        WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET;

    const allDataBuff = Buffer.allocUnsafe(totalSize);

    randomFillSync(allDataBuff, 0, WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET);

    allDataBuff.writeUInt32BE(dataBuff.byteLength, WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET);

    const dataStartPos = WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_EXPRESS_LENGTH +
        WX_OPENPLATFORM_DECRYPTED_XML_DATA_LENGTH_POSITION_OFFSET;

    const dataEndPos = dataStartPos + dataBuff.byteLength;

    dataBuff.copy(allDataBuff, dataStartPos);

    appIdBuff.copy(allDataBuff, dataEndPos);

    const encrypted = wxOpenPlatformEncryptBuffer(allDataBuff, keyBuff, ivBuff).toString('base64');

    return encrypted;
}


export function wxOpenPlatformSignatureSha1(...params: string[]) {
    const paramList = params;
    paramList.sort();

    const sha1Hash = createHash('sha1');
    sha1Hash.update(paramList.join(''), 'utf8');

    const digestedHexString = sha1Hash.digest('hex');

    return digestedHexString;
}

export function wxMiniProgramSignatureSha1(data: string, sessionKey: string) {
    const sha1Hash = createHash('sha1');
    sha1Hash.update(`${data}${sessionKey}`, 'utf8');

    const digestedHexString = sha1Hash.digest('hex');

    return digestedHexString;
}


export function wxPayDecryptAEAD(data: Buffer, key: Buffer, iv: Buffer, assocData: Buffer) {
    // As of Sep. 2021, WxPay AEAD means AEAD_AES_256_GCM

    const tagLength = 16;

    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
        authTagLength: tagLength
    });

    const authTag = data.slice(-tagLength);

    decipher.setAutoPadding(true);
    decipher.setAuthTag(authTag);
    decipher.setAAD(assocData);

    const buff1 = decipher.update(data);

    const buff2 = decipher.final();

    return Buffer.concat([buff1, buff2]);
}

export interface WxPayAEADEncryptedJSONObject {
    algorithm: 'AEAD_AES_256_GCM' | string;
    nonce: string;
    associated_data: string;
    ciphertext: string;
    original_type?: 'transaction' | string;
}

export function wxPayDecryptJSONObject(obj: WxPayAEADEncryptedJSONObject, key: Buffer) {
    if (obj.algorithm !== 'AEAD_AES_256_GCM') {
        throw new Error('Unsupported algorithm, what year is it ?');
    }

    const r = JSON.parse(
        wxPayDecryptAEAD(
            Buffer.from(obj.ciphertext, 'base64'),
            key,
            Buffer.from(obj.nonce, 'utf-8'),
            Buffer.from(obj.associated_data, 'utf-8')
        ).toString()
    );

    if (typeof r === 'object') {
        r['original_type'] = obj.original_type;
    }

    return r;
}


export function wxPaySign(data: Buffer, key: KeyObject) {
// As of Sep. 2021, WxPay APIv3 Sign means WECHATPAY2-SHA256-RSA2048

    const sign = createSign('sha256');

    sign.update(data);

    const signature = sign.sign(key);

    return signature;
}


export function wxPayOAEPDecrypt(data: Buffer, key: KeyObject) {
    return privateDecrypt({ key, padding: RSA_PKCS1_OAEP_PADDING }, data);
}

export function wxPayOAEPEncrypt(data: Buffer, key: KeyObject) {
    return publicEncrypt({ key, padding: RSA_PKCS1_OAEP_PADDING }, data);
}

export function wxPayRSASha256Vefify(data:Buffer, pubKey: KeyObject, signature: Buffer) {

    const verify = createVerify('sha256');

    verify.update(data);

    return verify.verify(pubKey, signature);
}