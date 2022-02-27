import { propertyInjectorFactory } from '@naiverlabs/tskit';
import { container } from "tsyringe";

export const InjectProperty = propertyInjectorFactory(container);

export default InjectProperty;
