import { DependencyContainer, singleton, container } from "tsyringe";
import { AbstractScheduleService, LoggerInterface } from "@naiverlabs/tskit";
import globalLogger from './logger';


@singleton()
export class ScheduleService extends AbstractScheduleService {
    container: DependencyContainer = container;
    logger: LoggerInterface = globalLogger;
    
}
