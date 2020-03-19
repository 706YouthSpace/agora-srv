import { MongodbClient } from '../../lib/mongodb';
import config from '../../config';


export const mongoClient = new MongodbClient(config.mongoUrl);
export const x706Database = mongoClient.database(config.mongoDatabase);

