import { URL } from "url";

export function length(min: number, max: number) {
    let func = (val: string) => {
        return val.length >= min && val.length <= max;
    }

    //func.name = `length${min}To${max}`;

    return func;
}

export function validNotifyUrl(val: string) {

    const url = new URL(val);

    return url.protocol === 'https:' && val.toString().length <= 128;
}

export function currencyAmount(val: number) {
    return Number.isInteger(val) && val >= 0;
}

export function purchaseAmount(val: number) {
    return Number.isInteger(val) && val >= 1;
}
