import { x706Database } from './client';

const testColl = x706Database.collection('test');

// tslint:disable-next-line: no-console
console.log(testColl.count({}));
