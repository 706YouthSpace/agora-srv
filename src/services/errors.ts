import { ApplicationError } from "@naiverlabs/tskit";

export enum APPLICATION_ERROR {
    UNKNOWN_ERROR = -1,
    PARAM_VALIDATION_ERROR = 40001,
    SQL_CREATION_ERROR = 40002,
    SSO_LOGIN_REQUIRED = 40101,
    OPERATION_NOT_ALLOWED = 40301,
    SSO_SUPER_USER_REQUIRED = 40302,
    INTERNAL_RESOURCE_NOT_FOUND = 40401,
    RPC_METHOD_NOT_FOUND = 40402,
    INTERNAL_RESOURCE_ID_CONFLICT = 40901,
    INTERNAL_DATA_CORRUPTION = 42201,

    RESOURCE_SOLD_OUT = 41001,
    RESOURCE_OVER_CAPACITY = 41002,

    WXPAY_CRYPTOLOGY_ERROR = 50301,

}

export class ResourceSoldOutError extends ApplicationError {
    constructor(detail?: any) {
        super(APPLICATION_ERROR.RESOURCE_SOLD_OUT, detail);
        this.readableMessage = `ResourceSoldOut: ${this.message} ${JSON.stringify(this.detail)}`;
    }
}
export class ResourceOverCapacityError extends ApplicationError {
    constructor(detail?: any) {
        super(APPLICATION_ERROR.RESOURCE_SOLD_OUT, detail);
        this.readableMessage = `ResourceOverCapacity: ${this.message} ${JSON.stringify(this.detail)}`;
    }
}
