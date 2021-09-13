import 'reflect-metadata';

import { AsyncService } from "@naiverlabs/tskit";
import { container, singleton } from "tsyringe";
import { WxaAccessTokenAgent } from './house-keeping/wxa-access-token';

@singleton()
export class HouseKeeper extends AsyncService {

    constructor(protected wxaAccessTokenAgent: WxaAccessTokenAgent) {
        super(...arguments);
    }

}



async function main() {

    const houseKeeper = container.resolve(HouseKeeper);

    return houseKeeper;
}

main();