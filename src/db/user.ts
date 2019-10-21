import { ObjectId } from "mongodb";
import { MongoCollection } from '../lib/mongodb/client';
import _ from 'lodash';
import { ApplicationError } from '../lib/errors';
import { vectorize } from '../lib/simple-tools';
import { wxService } from '../services/wexin';

export interface User {
    _id: ObjectId;
    wxOpenId: string;
    wxUnionId?: string;
    wxaId: string;
    createdAt: number;
    lastActiveAt: number;
    profile?: {
        nickName: string;
        realName?: string;
        gender?: 'male' | 'female';
        avatarUrl?: string;
        province?: string;
        country?: string;
        city?: string;

        wxId?: string;
        cellphone?: string;

        tags?: string[];

        school?: string;
        researchField?: string;

        organization?: string;
        position?: string;

        brefExperience?: string;
        brefSkills?: string;
        brefConcerns?: string;
        brefOthers?: string;

    };

    preferences?: {
        profilePrivacy?: {
            [k: string]: 'public' | 'contact' | 'private';
        };

        friending?: 'needs-confirmation' | 'allow-anyone' | 'disallow-everyone';
    },

    counters?: {
        [k: string]: number;
    }

    activated?: boolean;
    privileged?: boolean;
}

const profileKeys = new Set([
    'wxId', 'cellphone', 'nickName', 'realName', 'gender', 'avatarUrl', 'province', 'country', 'city',
    'tags', 'school', 'researchField', 'organization', 'position', 'brefExperience',
    'brefSkills', 'brefConcerns', 'brefOthers'
]);

const MAX_BREF_LENGTH = 512;
const MAX_GENERAL_STRING_LENGTH = 64;

export class UserMongoOperations extends MongoCollection<User> {
    sanitizeUserProfile(draft: { [k: string]: any }) {

        if (typeof draft !== 'object') {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }
        const result: { [k: string]: any } = {};

        for (const [k, v] of Object.entries(draft)) {
            if (!profileKeys.has(k)) {
                continue;
            }
            if (k === 'gender') {
                let gender = undefined;
                if (v === 0) {
                    gender = 'female';
                } else if (v === 1) {
                    gender = 'male';
                } else if (v && ((typeof v) === 'string')) {
                    gender = v;
                }
                result[k] = gender;
                continue;
            }
            if (k === 'tags') {
                let tags = [];
                if ((typeof v) === 'string') {
                    tags.push(v.split(/,|，| /));
                } else if (Array.isArray(v)) {
                    tags.push(...v);
                }
                tags = _.uniq(tags);
                result[k] = tags;
                continue;
            }
            if ((typeof v) !== 'string') {
                continue;
            }
            if (k.startsWith('bref')) {
                result[k] = v.substring(0, MAX_BREF_LENGTH);
                continue;
            }
            if (k === 'avatarUrl') {
                result[k] = v;
                continue;
            }

            result[k] = v.substring(0, MAX_GENERAL_STRING_LENGTH);
        }

        if (_.isEmpty(result)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        return result;
    }

    sanitizeUserPreferences(draft: { [k: string]: any }) {

        if (typeof draft !== 'object') {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }
        const result: { [k: string]: any } = {};

        for (const [k, v] of Object.entries(draft)) {
            switch (k) {
                case 'profilePrivacy': {
                    if (typeof v !== 'object') {
                        continue;
                    }
                    const validValues = new Set(['public', 'private', 'contact']);
                    const resultPart1: any = {};
                    for (const [pk, pv] of Object.entries(v)) {
                        if (!profileKeys.has(pk)) {
                            continue;
                        }

                        if (pv && validValues.has(pv as string)) {
                            resultPart1[pk] = pv;
                        }
                    }

                    if (_.isEmpty(resultPart1)) {
                        break;
                    }

                    result.profilePrivacy = resultPart1;

                    break;
                }

                default: {
                    continue;
                }
            }
        }

        if (_.isEmpty(result)) {
            // tslint:disable-next-line: no-magic-numbers
            throw new ApplicationError(40003);
        }

        return result;
    }

    wxLogin(wxaId: string, wxOpenId: string, wxUnionId?: string) {
        const ts = Date.now();

        return this.findOneAndUpdate(
            { wxOpenId },
            { $set: { wxaId, wxUnionId, lastActiveAt: ts }, $setOnInsert: { createdAt: ts } },
            { upsert: true, returnOriginal: false }
        );
    }


    async updateProfile(profile: object, wxaId: string, wxOpenId: string, wxUnionId?: string) {
        const sanitized = this.sanitizeUserProfile(profile);

        const query: any = vectorize({ profile: sanitized });

        if (wxUnionId) {
            await this.updateMany({ wxUnionId }, { $set: query });

            return this.findOne({ wxaId, wxOpenId });
        }

        return this.findOneAndUpdate({ wxaId, wxOpenId }, { $set: query }, { returnOriginal: false });
    }


    async updatePreferences(preferences: object, wxaId: string, wxOpenId: string, wxUnionId?: string) {
        const sanitized = this.sanitizeUserPreferences(preferences);

        const query: any = vectorize({ preferences: sanitized });

        if (wxUnionId) {
            await this.updateMany({ wxUnionId }, { $set: query });

            return this.findOne({ wxaId, wxOpenId });
        }

        return this.findOneAndUpdate({ wxaId, wxOpenId }, { $set: query }, { returnOriginal: false });
    }

    makeBrefUser(user: User, level: 'public' | 'contact' | 'private' = 'public') {
        const brefUser = _.clone(user);
        const profilePrivacy: { [k: string]: typeof level } = _.defaults(_.get(user, 'preferences.profilePrivacy'), { cellphone: 'private' });
        const currentProfile: any = user.profile || {};

        const resultProfile: any = {};

        for (const [key, val] of Object.entries(currentProfile)) {
            const privacyLevel = profilePrivacy[key];
            if (privacyLevel === 'private' && level !== 'private') {
                continue;
            }

            if (privacyLevel === 'contact' && level === 'public') {
                continue;
            }

            resultProfile[key] = val;
        }

        brefUser.profile = resultProfile;

        if (level !== 'private') {
            delete brefUser.preferences;
        }

        return brefUser;
    }

    getUsersById(ids: Array<(string | ObjectId)>, additionalQuery: any = {}) {
        return this.simpleFind({ ...additionalQuery, _id: { $in: ids.map((x) => new ObjectId(x)) }, wxaId: wxService.config.appId });
    }

    async getSingleUserById(id: string) {
        return this.findOne({ _id: new ObjectId(id) });
    }

    setActivatedById(_id: ObjectId, activated: boolean = true) {
        return this.updateOne({ _id }, { $set: { activated: Boolean(activated) } });
    }

    incCounter(_id: ObjectId, name: string, amount = 1) {
        return this.updateOne({ _id }, { $inc: { [`counter.${name}`]: amount } });
    }

}
