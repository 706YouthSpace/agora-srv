import { DependencyContainer, singleton, container } from "tsyringe";
import { AbstractScheduleService, LoggerInterface } from "@naiverlabs/tskit";
import globalLogger from './logger';


@singleton()
export class ScheduleService extends AbstractScheduleService {
    container: DependencyContainer = container;
    logger: LoggerInterface = globalLogger.child({ service: 'scheduleService' });

    constructor() {
        super(...arguments);

        this.init().catch((err) => { this.emit('error', err) });
    }

    override async init() {
        super.init();
        await this.dependencyReady();

        this.emit('ready');
    }
}

export const scheduleService = container.resolve(ScheduleService);
export const Recurred = scheduleService.Recurred.bind(scheduleService);
export default scheduleService;
