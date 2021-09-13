import { ObjectId } from 'mongodb';
import { Prop, assignMeta, Dto } from '@naiverlabs/tskit';


const pageSizeLimits = (input: number) => {
    if (input > 50000) {
        return false;
    }
    if (input <= 0) {
        return false;
    }

    if (parseInt(input as any, 10) !== input) {
        return false;
    }

    return true;
};

const pageIndexLimits = (input: number) => {
    if (input < 0) {
        return false;
    }

    if (parseInt(input as any, 10) !== input) {
        return false;
    }

    return true;
};

export class Pagination extends Dto {

    @Prop({ default: 20, validate: pageSizeLimits })
    pageSize!: number;

    @Prop({ default: 0, validate: pageIndexLimits })
    pageIndex!: number;

    @Prop({ validate: Boolean, type: [ObjectId, Date, Number, String] })
    pageAnchor?: ObjectId | Date | number | string;

    // @Prop({ default: 20, validate: pageSizeLimits })
    // limit!: number;

    // @Prop({ default: 0, validate: pageIndexLimits })
    // skip!: number;

    getSkip() {
        return (Math.max(this.pageIndex, 1) - 1) * this.pageSize;
    }

    getLimit() {
        return this.pageSize;
    }

    getAnchor() {
        return this.pageAnchor;
    }

    setMeta(data: object, extra?: object) {

        return assignMeta(data, {
            pageSize: this.pageSize,
            pageIndex: this.pageIndex,
            ...extra
        });
    }

}