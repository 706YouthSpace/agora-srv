import { convertToPinyin } from 'tiny-pinyin';

export function pinyinify(text: string) {


    const result = convertToPinyin(text, ' ', true);


    return result;
}
