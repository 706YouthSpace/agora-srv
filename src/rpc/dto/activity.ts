import { ObjectId } from "mongodb";
import { Prop, Dto } from "@naiverlabs/tskit"
import { URL } from "url";
import { PersonalInfo } from "db/activity";

export enum ACT_TYPE {
    PUBLIC_ACT = 'public',
    PRIVATE_ACT = 'private'
}

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


export class DraftActivity extends Dto {

    @Prop({
        validate: reasonableText
    })
    title?: string;


    @Prop()
    subtitle?: string;

    @Prop({
        validate: reasonableText
    })
    detail?: string;

    @Prop({
        type: ACT_TYPE
    })
    type?: ACT_TYPE;


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
        validateArray: wxGcj02LongitudeLatitude
    })
    locationCoord?: [number, number];

    @Prop()
    locationGB2260?: string;

    @Prop({
        type: ObjectId
    })
    site?: ObjectId;

    @Prop({
        type: Number
    })
    participantCap?: number;

    @Prop({
        type: Number
    })
    pricing?: number;

    @Prop({
        arrayOf: String,
        validate: reasonableText
    })
    tags?: string[];

    @Prop({
        arrayOf: PersonalInfo,
    })
    collectFromParticipants?: PersonalInfo[];

    @Prop({
        type: [String, ObjectId]
    })
    qrImage?: string | ObjectId;

    @Prop({
        type: Date
    })
    startAt?: Date;

    @Prop({
        type: Date
    })
    endAt?: Date;

}

export class DraftActivityForCreation extends DraftActivity {
    @Prop({
        validate: reasonableText,
        required: true
    })
    title!: string;

    @Prop({
        type: ACT_TYPE,
        default: ACT_TYPE.PUBLIC_ACT
    })
    type!: ACT_TYPE;
}