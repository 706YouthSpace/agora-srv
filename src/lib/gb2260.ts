import { singleton } from "tsyringe";

export interface GB2260Node {
    name: string;
    code: string;
    children?: GB2260Node[]
}

@singleton()
export class GB2260 {

    provinces: GB2260Node[];
    cities: GB2260Node[];

    provinceMap: { [k: string]: GB2260Node };
    cityMap: { [k: string]: GB2260Node };

    constructor() {
        const data: { [k: string]: string } = require('gb2260/lib/201607') as any;
        this.provinces = [];
        this.cities = [];
        const stack: GB2260Node[] = [];
        for (const [k, v] of Object.entries(data)) {
            if (k.endsWith('0000')) {
                stack.length = 0;
                const node = {
                    name: v,
                    code: k,
                    children: []
                };
                this.provinces.push(node);
                stack.push(node);
            } else if (k.endsWith('00')) {
                stack.length = 1;
                const node = {
                    name: v,
                    code: k,
                    children: []
                };
                this.cities.push(node);
                const province = stack[0];
                if (province) {
                    province.children?.push(node);
                }
                stack.push(node);
            } else {
                stack.length = 2;

                const node = {
                    name: v,
                    code: k,
                    // children: []
                };
                const city = stack[1];
                if (city) {
                    city.children?.push(node);
                }
            }
        }

        this.provinceMap = {};
        for (const x of this.provinces) {
            this.provinceMap[x.code] = x;
        }

        this.cityMap = {};
        for (const x of this.cities) {
            this.cityMap[x.code] = x;
        }
    }


    getProvinces() {
        return this.provinces;
    }

    getProvince(code: string): GB2260Node | undefined {
        return this.provinceMap[`${code.slice(0, 2)}0000`];
    }

    getCity(code: string): GB2260Node | undefined {
        return this.cityMap[`${code.slice(0, 4)}00`];
    }
}