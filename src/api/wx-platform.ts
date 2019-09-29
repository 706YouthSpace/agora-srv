import { Context } from 'koa';

import { wxService } from '../services/wexin';
// import { ApplicationError } from '../lib/errors';
import { ContextLogger } from './middlewares/logger';
import config from '../config';

const wxAppId = config.wechat.appId;

export async function wxPlatformLandingController(ctx: Context, next: () => Promise<unknown>) {

    const signatureVerified = wxService.verifyOpenPlatformQuerySignature(ctx.query.signature, ctx.query.timestamp, ctx.query.nonce);

    if (!signatureVerified) {
        // tslint:disable-next-line: no-magic-numbers
        ctx.status = 400;
        ctx.body = 'NOT VERIFIED';

        return next();
    }

    ctx.body = 'success';

    let parsed: { [k: string]: any } | undefined;

    if (ctx.request.type === 'application/xml' || ctx.request.type === 'text/xml') {
        parsed = await wxService.parseEncryptedIncomingXmlString((ctx.rawBody) as string);
    }

    if (!parsed) {
        (ctx as typeof ctx & ContextLogger).logger.info('Unparsed incoming message.', { req: ctx.request });

        return next();
    }
    if (((wxAppId === 'wx570bc396a51b8ff8' && parsed.ToUserName === 'gh_3c884a361561') ||
        (wxAppId === 'wxd101a85aa106f53e' && parsed.ToUserName === 'gh_8dad206e9538')) && parsed.MsgType === 'text') {
        // Wechat Test Agent;

        // QUERY_AUTH_CODE:$query_auth_code$
        const specialContent: string = parsed.Content;
        const [, queryAuthCode] = specialContent.split(':');
        if (queryAuthCode) {

            const result = await wxService.getClientAccessToken(queryAuthCode);
            if (result) {
                const accessToken = result.authorization_info.authorizer_access_token;
                await wxService.wxaSendCustomerServiceMessage(
                    accessToken, parsed.FromUserName, 'text', `${queryAuthCode}_from_api`
                );
            }

        }

        return next();

    }

    const merged = { ...parsed, ...ctx.query, wxAppId };
    await wxService.handleOpenPlatformClientIncomingMessage(merged);

    return next();
}
