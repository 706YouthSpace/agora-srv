import { ObjectId } from "mongodb";
import { Prop, Dto } from "@naiverlabs/tskit"
import { EVENT_SENSOR_STATUS, EVENT_TYPE } from "../../db/event";

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


export class DraftEvent extends Dto {

    @Prop({
        validate: reasonableText,
        required: true
    })
    title!: string;

    @Prop()
    subtitle?: string;

    @Prop()
    detail?: string;

    @Prop({
        type: EVENT_TYPE,
        default: EVENT_TYPE.PUBLIC
    })
    type!: EVENT_TYPE;


    @Prop({ type: [ObjectId, URL] })
    image?: ObjectId | URL;


    @Prop({ arrayOf: [ObjectId, URL] })
    images?: Array<ObjectId | URL>;

    @Prop()
    locationText?: string;

    @Prop({
        arrayOf: Number,
        validateCollection: wxGcj02LongitudeLatitude
    })
    locationCoord?: [number, number];

    @Prop()
    locationGB2260?: string;

    @Prop({ required: true })
    site!: ObjectId;

    @Prop()
    participantCap?: number;

    @Prop()
    pricing?: number;

    @Prop({
        arrayOf: String,
        validate: reasonableText
    })
    tags?: string[];

    @Prop({
        arrayOf: String,
        validate: reasonableText
    })
    collectFromParticipants?: string[];

    @Prop({
        type: [ObjectId, URL]
    })
    qrImage?: ObjectId | URL;

    @Prop({
        type: Date
    })
    startAt?: Date;

    @Prop({
        type: Date
    })
    endAt?: Date;

    @Prop({
        type: EVENT_SENSOR_STATUS,
        default: EVENT_SENSOR_STATUS.PENDING
    })
    verified?: EVENT_SENSOR_STATUS;

    @Prop({
        type: ObjectId,
        required: true
    })
    creator!: ObjectId

    @Prop({
        arrayOf: String,
        default: []
    })
    wxMsgTemplateIds!: string[];
}

