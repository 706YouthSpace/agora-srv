import { FancyFile, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick, RPCMethod } from "./civi-rpc/civi-rpc";
import { FileRecord, MongoFile } from "../db/file";
//import { config } from "../config";
import { UploadedFile } from "./civi-rpc/body-parser";
import { Session } from "./dto/session";
import { X706ObjectStorage } from "../services/object-storage/x706";
//import { SessionUser } from "./dto/user";

@singleton()
export class FileUploadRPCHost extends RPCHost {

    constructor(
        protected mongoFile: MongoFile,
        protected x706ObjectStorage: X706ObjectStorage,
    ) {
        super(...arguments);
        this.init();
    }

    async init() {
        await this.dependencyReady();
        this.emit('ready');
    }


    @RPCMethod('file.upload')
    async upload(
        // sessionUser: SessionUser,
        @Pick('file', { type: FancyFile })
        file: UploadedFile,
        session: Session
    ) {
        // const userId = await sessionUser.assertUser();
        await file.ready;

        const user = await session.getUser();

        const fileRecord = FileRecord.from<FileRecord>({
            ownerId: user?._id,
            sha256Hex: await file.sha256Sum,
            name: await file.fileName,
            mimeType: await file.mimeType,
            size: await file.size,
        });


        await this.x706ObjectStorage.putSingleFile(file, `f/${fileRecord._id}`)
        const record = await this.mongoFile.create(fileRecord);

        //const storeDir = _.get(config, 'storage.sha256Root');

        const url = await this.x706ObjectStorage.signDownloadObject(`f/${fileRecord._id}`, 86400);

        return { ...record, url };
    }

}
