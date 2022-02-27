import _ from 'lodash';
import { ObjectId } from "mongodb";
import { singleton, container } from 'tsyringe';
import { AutoCastable, Prop } from '@naiverlabs/tskit';

import { MongoCollection } from './base';

export enum FILE_OWNER_TYPE {
    USER = 'user',
    SYSTEM = 'system',
}
export class FileRecord extends AutoCastable {
    @Prop({ defaultFactory: () => new ObjectId() })
    _id!: ObjectId;

    @Prop({ required: true })
    owner!: ObjectId;

    @Prop({ type: FILE_OWNER_TYPE, default: FILE_OWNER_TYPE.USER })
    ownerType!: FILE_OWNER_TYPE;

    @Prop({ required: true })
    sha256Hex!: string;

    @Prop({ required: true })
    name!: string;

    @Prop()
    mimeType?: string;

    @Prop()
    size?: number;

    @Prop({ dictOf: Object })
    properties?: {
        [k: string]: any;
    }

    @Prop()
    createdAt?: Date;

    @Prop()
    updatedAt?: Date;

    @Prop()
    blocked?: boolean;
}


@singleton()
export class MongoFile extends MongoCollection<FileRecord> {
    collectionName = 'files';

}


export const mongoFile = container.resolve(MongoFile);
