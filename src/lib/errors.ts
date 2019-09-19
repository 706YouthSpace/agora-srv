// tslint:disable:no-magic-numbers
import { HTTPError } from './http-error';

const knoledgeBase = new Map<number, string>([
    [40000, 'Bad Request'],

    [40001, 'Absense of required param'],
    [40002, 'Invalid security code'],
    [40003, 'Invalid param'],
    [40004, 'External service failure'],
    [40005, 'Complicated decryption failure'],
    [40006, 'Index out of range'],
    [40007, 'Range too wide'],
    [40008, 'Duplicated request'],
    [40009, 'Bad upload'],


    [40100, 'Unauthorized'],
    [40101, 'Login credential issue'],
    [40102, 'Login required'],
    [40103, 'No such user'],

    [40200, 'Payment Required'],


    [40300, 'Forbidden'],

    [40301, 'Too many failed attempts'],
    [40302, 'Invalid access token'],
    [40303, 'Not authorized'],
    [40304, 'Invalid signature'],
    [40305, 'Forbidden by external service'],


    [40400, 'Not Found'],

    [40401, 'Internal resource not found'],
    [40402, 'Referenced resource not found'],
    [40403, 'Requested function not found'],

    [40500, 'Method Not Allowed'],
    [40501, 'Websocket required'],

    [40600, 'Not Acceptable'],


    [40700, 'Proxy Authentication Required'],


    [40800, 'Request Timeout'],


    [40900, 'Conflict'],

    [40901, 'Security verification conflict'],
    [40902, 'User identity conflict'],
    [40903, 'Internal reference conflict'],

    [41000, 'Gone'],


    [41100, 'Length Required'],


    [41200, 'Precondition Failed'],

    [41201, 'Security code not issued'],
    [41202, 'Security code timed out'],
    [41203, 'Security code required'],
    [41204, 'Nothing to do'],
    [41205, 'External depenency not satisfied'],
    [41206, 'Criteria not satisfied'],
    [41207, 'Out of stock'],
    [41208, 'Insufficient account balance'],
    [41209, 'Lacking required scope'],
    [41210, 'Insufficient space'],


    [41300, 'Payload Too Large'],


    [41400, 'URI Too Long'],


    [41500, 'Unsupported Media Type'],


    [41600, 'Range Not Satisfiable'],


    [41700, 'Expectation Failed'],

    [41800, 'I\'m a teapot'],


    [42100, 'Misdirected Request'],
    [42101, 'Incompatible entity type'],


    [42200, 'Unprocessable Entity'],


    [42300, 'Locked'],


    [42400, 'Failed Dependency'],

    [42401, 'Preceding operations needed'],

    [42600, 'Upgrade Required'],


    [42800, 'Precondition Required'],


    [42900, 'Too Many Requests'],

    [42901, 'Security code requests too frequent'],


    [43100, 'Request Header Fields Too Large'],


    [45100, 'Unavailable For Legal Reasons'],


    [50000, 'Internal Server Error'],

    [50001, 'Service dependencies not satisfied'],
    [50002, 'Assumed condition did not apply'],
    [50003, 'Possibly dirty data issue'],


    [50100, 'Not Implemented'],


    [50200, 'Bad Gateway'],


    [50300, 'Service Unavailable'],

    [50301, 'External service unexpected failure'],
    [50302, 'Deadend'],
    [50303, 'Insufficient Resource'],

    [50400, 'Gateway Timeout'],


    [50500, 'HTTP Version Not Supported'],


    [50600, 'Variant Also Negotiates'],


    [50700, 'Insufficient Storage'],


    [50800, 'Loop Detected'],


    [51000, 'Not Extended'],


    [51100, 'Network Authentication Required']
]);


export class ApplicationError extends HTTPError {

    constructor(code: number, data?: any, ...others: any[]) {
        let _code = code;
        if (_code < 1000) {
            // tslint:disable-next-line:no-magic-numbers
            _code = _code * 100;
        }
        super(code, knoledgeBase.get(_code) ? `Application Error ${_code}: ${knoledgeBase.get(_code)}` : 'Application Error', data);
        if (others && others.length) {
            const fusionData = {};
            const otherMessages = [];
            for (const x of others) {
                if (typeof x === 'object') {
                    Object.assign(fusionData, x);
                } else {
                    otherMessages.push(x);
                }
            }
            if (typeof this.data === 'object') {
                Object.assign(this.data, fusionData, { otherMessages });
            } else {
                const origData = this.data;
                this.data = fusionData;
                this.data.otherMessages = [origData, ...otherMessages];
            }
        }
    }

}

export class CodeLogicError extends ApplicationError {
    constructor(msg: string, ...otherStuff: any[]) {
        super(50000, msg, ...otherStuff);
    }
}
