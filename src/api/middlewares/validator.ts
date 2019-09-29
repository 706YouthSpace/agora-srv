import { Context } from 'koa';
import { ValidationError } from '../../lib/validator';
import { paramValidator } from '../../services/validator';
import { ApplicationError } from '../../lib/errors';

export interface ContextValidator {
    validator: {
        validate: (value: any, rule: string, ...ruleParams: any[]) => Promise<boolean>;
        assertValid: (name: string, value: any, rule: string, ...ruleParams: any[]) => Promise<true>;
    }
}

export async function injectValidatorMiddleware(ctx: Context & ContextValidator, next: () => Promise<any>) {

    const validatorFacl: any = {};

    validatorFacl.validate = paramValidator.validate.bind(paramValidator);

    validatorFacl.assertValid = async (name: string, value: any, rule: string, ...ruleParams: any[]) => {

        let result: true;

        try {
            result = await paramValidator.assert(value, rule, ...ruleParams);
        } catch (err) {
            if (err instanceof ValidationError) {
                // tslint:disable-next-line: no-magic-numbers
                throw new ApplicationError(40003, name, {
                    key: name,
                    value,
                    reaseon: err.reason,
                    message: `${name} is not a valid ${rule}(${ruleParams.join(', ')})`,
                    ruleDesc: err.ruleDesc
                });
            }

            throw err;
        }

        return result;
    };

    ctx.validator = validatorFacl;

    return next();
}
