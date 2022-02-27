import { ObjectId } from "mongodb";
import { Prop, Dto } from "@naiverlabs/tskit"
import { URL } from "url";
import { SITE_TYPE } from "../../db/site";

export function wxGcj02LongitudeLatitude(input: [number, number]) {
    if (input.length !== 2) {
        return false;
    }

    const [longitude, latitude] = input;

    if (longitude < -180 || longitude > 180) {
        return false;
    }

    if (latitude < -90 || latitude > 90) {
        return false
    }

    return true;
}

export function reasonableText(input: string) {
    if (input.length < 2 || input.length > 25) {
        return false;
    }

    return true;
}


export class DraftSite extends Dto {

    @Prop({
        validate: reasonableText
    })
    name?: string;

    @Prop({
        type: SITE_TYPE,
        default: SITE_TYPE.BASE
    })
    type!: SITE_TYPE;


    @Prop({
        type: [ObjectId, URL]
    })
    image?: URL | ObjectId;


    @Prop({
        arrayOf: [ObjectId, URL as any]
    })
    images?: Array<URL | ObjectId>;


    @Prop()
    locationText?: string;

    @Prop({
        arrayOf: Number,
        validateCollection: wxGcj02LongitudeLatitude
    })
    locationCoord?: [number, number];

    @Prop()
    locationGB2260?: string;

    @Prop<string[]>({
        arrayOf: String,
        validate: reasonableText,
        default: []
    })
    tags!: string[];
}

export class DraftSiteForCreation extends DraftSite {
    @Prop({
        validate: reasonableText,
        required: true
    })
    name!: string;

    @Prop({
        type: SITE_TYPE,
        default: SITE_TYPE.PUBLIC_PLACES
    })
    type!: SITE_TYPE;
}
