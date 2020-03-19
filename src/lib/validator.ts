
export type ValidatorFunc = (val: any, ...params: any[]) => boolean | Promise<boolean>;


export class ValidationError extends Error {
    ruleName: string;
    ruleFunc: ValidatorFunc;
    value: any;
    ruleDesc?: string;
    reason: any;

    constructor(name: string, ruleFunc: ValidatorFunc, val: any, ruleDesc?: string, reason?: any) {
        super(`${val} is not a valid ${name}`);

        this.ruleName = name;
        this.ruleFunc = ruleFunc;
        this.value = val;
        this.reason = reason;
        this.ruleDesc = ruleDesc;
    }

}

export class ParamValidator {

    rules: Map<string, ValidatorFunc> = new Map();
    descs: Map<string, string> = new Map();

    constructor(rules?: Array<[string, ValidatorFunc | RegExp, string | undefined]>) {
        if (Array.isArray(rules)) {
            for (const [n, r, t] of rules) {
                this.register(n, r, t);
            }
        }

    }


    register(name: string, rule: ValidatorFunc | RegExp, description?: string) {

        if (!name) {
            throw new Error('Name is required for validator');
        }

        if (typeof rule === 'function') {
            this.rules.set(name, rule);
        } else if (rule instanceof RegExp) {
            this.rules.set(name, async (val: any) => {
                return val && Boolean(rule.test(val));
            });
        } else {
            throw new Error('Validator rule must be either RegExp or Function');
        }

        if (description) {
            this.descs.set(name, description);
        }

    }

    async validate(val: any, rule: string, ...params: any[]) {

        const validator = this.rules.get(rule);

        if (!validator) {
            throw new Error('Unregistered validator: ' + rule);
        }

        try {
            const result = await validator(val, ...params);

            return Boolean(result);
        } catch (err) {
            return false;
        }
    }

    async assert(val: any, rule: string, ...params: any[]): Promise<true> {

        const validator = this.rules.get(rule);

        if (!validator) {
            throw new Error('Unregistered validator: ' + rule);
        }

        let result;
        try {
            result = await validator(val, ...params);
        } catch (err) {
            const desc = this.descs.get(rule);
            throw new ValidationError(rule, validator, val, desc, err);
        }

        if (!result) {
            const desc = this.descs.get(rule);
            throw new ValidationError(rule, validator, val, desc, result);
        }

        return true;
    }

}
