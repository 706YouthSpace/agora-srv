import { FancyFile, RPCHost } from "@naiverlabs/tskit";
import { singleton } from "tsyringe";
import _ from "lodash";
import { Pick, RPCMethod } from "./civi-rpc";
import { MongoFile,FileRecord } from "../db/file";
import {config} from "../config";
import { StorageManager } from "../services/storage";
import { UploadedFile } from "../api/middlewares/body-parser";
import { SessionUser } from "./dto/user";

@singleton()
export class FileUploadRPCHost extends RPCHost {

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

    @RPCMethod('file.upload')
    async upload(
        sessionUser: SessionUser,
        @Pick('file', { type: FancyFile })
        file: UploadedFile
    ) {
        const userId = await sessionUser.assertUser();
        let fileRcd=<FileRecord> {} ;
        //let fileRcd: any ;
        fileRcd.owner = userId ;
        fileRcd.sha256SumHex = await file.sha256Sum;
        fileRcd.mimeType = file.claimedMime==undefined?"":file.claimedMime ;
        fileRcd.name = fileRcd.mimeType=="" ? fileRcd.sha256SumHex : fileRcd.sha256SumHex+"."+fileRcd.mimeType;
        
        fileRcd.createdAt = new Date;
        const storeDir = _.get(config, 'storage.sha256Root') ;
        this.localFileStorage.storeFancyFile(file, storeDir , fileRcd.name);

        return userId;
    }

}
