import { makeRPCKit } from "tskit";
import { container } from "tsyringe";

const RPCRegistry = makeRPCKit(container);

container.registerSingleton(RPCRegistry);

export const rPCRegistry = container.resolve(RPCRegistry);

export const { RPCMethod, Pick } = rPCRegistry.decorators();
