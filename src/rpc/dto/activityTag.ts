import { Prop, Dto } from "@naiverlabs/tskit"

export class activityTag extends Dto {

    @Prop()
    code?: string;

    @Prop()
    name!: string;

}
