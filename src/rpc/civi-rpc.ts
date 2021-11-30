import { makeRPCKit } from "@naiverlabs/tskit";
import { container } from "tsyringe";

const RPCRegistry = makeRPCKit(container);

container.registerSingleton(RPCRegistry);

export const rPCRegistry = container.resolve(RPCRegistry);

export const { RPCMethod, Pick, Ctx } = rPCRegistry.decorators();
