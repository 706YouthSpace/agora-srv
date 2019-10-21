import { ObjectId } from "mongodb";
import { MongoCollection } from '../lib/mongodb/client';
import _ from 'lodash';
import { ApplicationError } from '../lib/errors';
import { vectorize } from '../lib/simple-tools';
import { wxService } from '../services/wexin';

export interface Post {
    _id: ObjectId;

    title: string;

    coverUrl?: string;

    wxaIds?: string;

    author: ObjectId;
    inReplyToPost: ObjectId;

    content: string;

    tags?: string[];

    images?: ObjectId[];
    video?: ObjectId;
    attachments?: { [k: string]: ObjectId };

    blocked?: boolean;
    
    counter?: {
        [k: string]: number;
    }

    createdAt: number;
    updatedAt: number;
}

const TITLE_MAX_LENGTH = 128;
const TAG_MAX_LENGTH = 128;
const CONTENT_MAX_LENGTH = 102400;

const objIdFields = new Set(['_id', 'author', 'inReplyToPost']);
export class PostMongoOperations extends MongoCollection<Post> {

    sanitizePost(draft: Partial<Post>) {
        if (!((draft.content || (draft.images && draft.images.length) || draft.video || draft.attachments) && draft.author)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        for (const x in objIdFields) {
            if ((draft as any)[x] && !((draft as any)[x] instanceof ObjectId)) {
                // tslint:disable-next-line: no-magic-numbers
                throw new ApplicationError(40003, x);
            }
        }

        if (draft.content) {
            draft.content = draft.content.substring(0, CONTENT_MAX_LENGTH);
        }
        if (draft.title) {
            draft.title = draft.title.substring(0, TITLE_MAX_LENGTH);
        }

        if (Array.isArray(draft.tags)) {
            draft.tags = draft.tags.filter((x) => {
                if (typeof x === 'string' && x.length <= TAG_MAX_LENGTH) {
                    return x;
                }

                return false;
            });
        }

        delete draft.wxaIds;

        return draft;
    }

    newPost(draft: Partial<Post>) {
        const sanitized = this.sanitizePost(draft);
        const ts = Date.now();

        return this.insertOne({ ...sanitized, wxaIds: [wxService.config.appId], createdAt: ts, updatedAt: ts } as any);
    }

    setToPost(id: ObjectId, draft: Partial<Post>) {
        const sanitized = this.sanitizePost(draft);

        return this.findOneAndUpdate({ _id: id }, { $set: { ...vectorize(sanitized), updatedAt: Date.now() } });
    }

    incCounter(_id: ObjectId, name: string, amount = 1) {
        return this.updateOne({ _id }, { $inc: { [`counter.${name}`]: amount } });
    }

}
