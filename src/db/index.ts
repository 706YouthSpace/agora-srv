import { x706Database } from './client';
import { UserMongoOperations } from './user';
import { AdjacencyMongoOperations } from './adjacency';
import { PostMongoOperations } from './post';


export const userMongoOperations: UserMongoOperations = x706Database.collection('users', UserMongoOperations);
export const adjacencyMongoOperations: AdjacencyMongoOperations = x706Database.collection('relations', AdjacencyMongoOperations);
export const postMongoOperations: PostMongoOperations = x706Database.collection('posts', PostMongoOperations);
