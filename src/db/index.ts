import { x706Database } from './client';
import { UserMongoOperations } from './user';
import { AdjacencyMongoOperations } from './adjacency';
import { PostMongoOperations } from './post';
import { FileMongoOperations } from './file';
import { DirMongoOperations } from './dir';


export const userMongoOperations: UserMongoOperations = x706Database.collection('users', UserMongoOperations);
export const adjacencyMongoOperations: AdjacencyMongoOperations = x706Database.collection('relations', AdjacencyMongoOperations);
export const postMongoOperations: PostMongoOperations = x706Database.collection('posts', PostMongoOperations);
export const fileMongoOperations: FileMongoOperations = x706Database.collection('files', FileMongoOperations);
export const dirMongoOperations: DirMongoOperations = x706Database.collection('dirs', DirMongoOperations);
