import { MongoClient } from 'mongodb';
import config from '../../config';


export const mongoClient = new MongoClient(config.mongoUrl);
export const x706Database = mongoClient.db('x706');

