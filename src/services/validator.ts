
import { ParamValidator } from '../lib/validator';
import { ObjectId } from 'mongodb';
import { URL } from 'url';


const validatorRules: any = [
    ['cellphone', /^\d{11}$/, 'Cellphone number is assumed to be 11 digits'],
    ['cellphonePrefix', /^\d{1,4}$/, 'Cellphone prefix is assumed to be 1 - 4 digits'],

    [
        'text',
        (val: string, l1?: number, l2?: number) => {
            if (typeof val !== 'string') {
                return false;
            }
            if (l2) {
                if (!(val.length >= (l1 || 0) && val.length <= l2)) {
                    return false;
                }
            } else if (l1) {
                if (!(val.length < l1)) {
                    return false;
                }
            }

            return true;
        },
        'Input has to be text, maybe with length requirement'
    ],

    ['password', /^[a-zA-Z0-9\-_\.\=]{6,21}$/, '[a-Z][a-Z0-9-_.=]{6,21}'],
    ['timestamp', /^[0-9]{13}$/, 'Timestamp should be 13 digit number'],
    ['ObjectId', (val: any) => ObjectId.isValid(val), 'Valid bson ObjectId'],
    [
        'ObjectId[]',
        (val: any) => {
            if (!Array.isArray(val) && val.length) {
                return false;
            }
            for (const x of val) {
                if (!ObjectId.isValid(x)) {
                    return false;
                }
            }

            return true;
        },
        'Compact array of valid bson ObjectId'],
    [
        'list',
        (val: any, l1?: number, l2?: number) => {
            if (!Array.isArray(val)) {
                return false;
            }
            if (l2) {
                if (!(val.length >= (l1 || 0) && val.length <= l2)) {
                    return false;
                }
            } else if (l1) {
                if (!(val.length < l1)) {
                    return false;
                }
            }

            return true;
        },
        'Input has to be an array, maybe with length requirement'],
    [
        'compactList',
        (val: any, l1?: number, l2?: number) => {
            if (!Array.isArray(val)) {
                return false;
            }
            if (l2) {
                if (!(val.length >= (l1 || 0) && val.length <= l2)) {
                    return false;
                }
            } else if (l1) {
                if (!(val.length < l1)) {
                    return false;
                }
            }
            for (const x of val) {
                if (!x) {
                    return false;
                }
            }

            return true;
        },
        'Input has to be an array, maybe with length requirement. Values must be truthy'],
    [
        'url',
        (val: string) => {
            if (typeof val !== 'string') {
                return false;
            }

            return new URL(val);
        },
        'Input has to be a valid url. Which contains https:// or http://']

];

export const paramValidator = new ParamValidator(validatorRules);
