import { x706Database } from './client';


export const testCollection = x706Database.collection('test');
// tslint:disable-next-line: no-console
testCollection.count({}).then(console.log).catch(console.error);


