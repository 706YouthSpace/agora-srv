import * as Koa from 'koa';


export interface ExtendedContext extends Koa.Context {
    pathDecoded: string;
    urlDecoded: string;
    routeParam: { [key: string]: string | undefined };
    session: { [key: string]: any };
}

export type KoaMiddleware = (ctx: ExtendedContext, next?: () => Promise<any>) => Promise<any>;
export type Routeable = Koa | KoaMiddleware;
export type ErrorHandler = (err: Error, ctx: ExtendedContext) => Promise<any>;
export interface Task {
    func: (ctx: ExtendedContext, next?: () => Promise<any>) => Promise<any>;
    config: RouteConfig;
}
export type NextCallback = (err?: Error) => Promise<any>;

export interface RouteConfig {
    name?: string;
    before?: 'init' | 'start' | 'checkpoint' | string | string[];
    after?: 'init' | 'start' | 'checkpoint' | string | string[];
    ttl?: number;
    methodOnly?: string | string[];
    methodIsNot?: string | string[];
    sideEffect?: 'none' | any;
    thisArg?: any;
    restrict?: undefined | '' | 'none' | 'leafOnly' | 'nodeOnly' | 'dynamicOnly' | 'fullMatch' | 'exactMatch';
    invocation?: undefined | 'positional' | 'implicit' | 'explicit';
}
