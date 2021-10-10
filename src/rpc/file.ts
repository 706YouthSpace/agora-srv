import { FancyFile, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick, RPCMethod } from "./civi-rpc";
import { MongoFile } from "../db/file";
import { StorageManager } from "../services/storage";
import { UploadedFile } from "../api/middlewares/body-parser";
import { SessionUser } from "./dto/user";

@singleton()
export class FileUploadHost extends RPCHost {

    constructor(
        protected mongoFile: MongoFile,
        protected localFileStorage: StorageManager
    ) {
        super(...arguments);
        this.init();
    }

    async init() {
        await this.dependencyReady();
        this.emit('ready');
    }


    @RPCMethod('file.saveRandomFile')
    async saveRandomFile(
        sessionUser: SessionUser,

        @Pick('file', { type: FancyFile })
        file: UploadedFile
    ) {
        const userId = await sessionUser.assertUser();

        this.localFileStorage.storeFancyFile(file, await file.sha256Sum);

        return userId;
    }

}
