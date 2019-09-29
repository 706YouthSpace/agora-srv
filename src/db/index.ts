import { x706Database } from './client';
import { UserMongoOperations } from './user';
import { AdjacencyMongoOperations } from './adjacency';


export const userMongoOperations: UserMongoOperations = x706Database.collection('users', UserMongoOperations);
export const adjacencyMongoOperations: AdjacencyMongoOperations = x706Database.collection('relations', AdjacencyMongoOperations);
