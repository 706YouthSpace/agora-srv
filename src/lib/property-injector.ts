import { propertyInjectorFactory } from 'tskit';
import { container } from "tsyringe";

export const InjectProperty = propertyInjectorFactory(container);